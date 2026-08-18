import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { domains, mailboxes, type DnsRecord } from "@/lib/db/schema";
import { ApiTokenMissingError, cloudflareApi, CloudflareApiError } from "@/lib/cloudflare/api";
import { dnsRecordsFor } from "@/lib/mail/mailboxes";

type Params = { params: Promise<{ domainId: string }> };

/**
 * Re-checks a domain against the Cloudflare API: resolves the zone, enables Email
 * Routing if it is off, points the addresses on this domain at this Worker, and
 * records which required DNS entries are present.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { domainId } = await params;

    const rows = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.ownerId, user.id)))
      .limit(1);
    const domain = rows[0];
    if (!domain) throw new ApiError(404, "Domain not found");

    const api = cloudflareApi(env);
    if (!api.configured) {
      throw new ApiError(
        503,
        "Set the CLOUDFLARE_API_TOKEN secret to verify domains automatically.",
      );
    }

    const zone = domain.zoneId
      ? { id: domain.zoneId }
      : await api.findZone(domain.name);
    if (!zone) {
      await db
        .update(domains)
        .set({ status: "error", lastCheckedAt: Math.floor(Date.now() / 1000) })
        .where(eq(domains.id, domain.id));
      throw new ApiError(404, `${domain.name} is not a zone on this Cloudflare account.`);
    }

    const status = await api.emailRoutingStatus(zone.id);
    if (!status.enabled) {
      await api.enableEmailRouting(zone.id).catch(() => undefined);
    }

    const present = await presentRecords(api, zone.id);
    const records: DnsRecord[] = dnsRecordsFor(domain.name).map((record) => ({
      ...record,
      present: present.has(recordKey(record.type, record.name, record.content)),
    }));

    const routingReady = records
      .filter((record) => record.type === "MX")
      .every((record) => record.present);
    const sendingReady = routingReady && records.some((r) => r.type === "TXT" && r.present);

    const routed = await routeMailboxes(api, db, zone.id, domain.id, workerScriptName());

    await db
      .update(domains)
      .set({
        zoneId: zone.id,
        status: routingReady ? "verified" : "pending",
        routingEnabled: status.enabled || routingReady,
        sendingEnabled: sendingReady,
        dnsRecords: records,
        lastCheckedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(domains.id, domain.id));

    return Response.json({
      status: routingReady ? "verified" : "pending",
      routingEnabled: status.enabled || routingReady,
      sendingEnabled: sendingReady,
      records,
      routedAddresses: routed,
    });
  } catch (error) {
    if (error instanceof ApiTokenMissingError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof CloudflareApiError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    return errorResponse(error);
  }
}

async function presentRecords(
  api: ReturnType<typeof cloudflareApi>,
  zoneId: string,
): Promise<Set<string>> {
  const present = new Set<string>();
  for (const type of ["MX", "TXT"]) {
    const records = await api.listDnsRecords(zoneId, type).catch(() => []);
    for (const record of records) {
      present.add(recordKey(record.type, record.name, record.content));
    }
  }
  return present;
}

/** Creates an Email Routing rule for each native mailbox that does not already have one. */
async function routeMailboxes(
  api: ReturnType<typeof cloudflareApi>,
  db: Database,
  zoneId: string,
  domainId: string,
  workerName: string,
): Promise<string[]> {
  const addresses = await db
    .select({ address: mailboxes.address })
    .from(mailboxes)
    .where(and(eq(mailboxes.domainId, domainId), eq(mailboxes.type, "native")));
  if (addresses.length === 0) return [];

  const existing = await api.listRules(zoneId).catch(() => []);
  const alreadyRouted = new Set(
    existing.flatMap((rule) =>
      rule.matchers.filter((matcher) => matcher.field === "to").map((matcher) => matcher.value ?? ""),
    ),
  );

  const routed: string[] = [];
  for (const { address } of addresses) {
    if (alreadyRouted.has(address)) continue;
    try {
      await api.routeAddressToWorker(zoneId, address, workerName);
      routed.push(address);
    } catch {
      // Leave it for the next verify pass rather than failing the whole check.
    }
  }
  return routed;
}

function recordKey(type: string, name: string, content: string): string {
  return `${type.toUpperCase()}|${name.toLowerCase()}|${content.trim().toLowerCase()}`;
}

function workerScriptName(): string {
  return process.env.WORKER_SCRIPT_NAME ?? "workers-mail";
}
