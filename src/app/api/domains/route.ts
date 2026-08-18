import { asc, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { domains } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { dnsRecordsFor } from "@/lib/mail/mailboxes";
import { cloudflareApi } from "@/lib/cloudflare/api";

type CreateBody = { name?: string };

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const rows = await db
      .select()
      .from(domains)
      .where(eq(domains.ownerId, user.id))
      .orderBy(asc(domains.name));
    return Response.json({ domains: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<CreateBody>(request);
    const name = body.name?.trim().toLowerCase() ?? "";
    if (!DOMAIN_PATTERN.test(name)) throw new ApiError(400, "Enter a valid domain name.");

    const existing = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.name, name))
      .limit(1);
    if (existing.length > 0) throw new ApiError(409, "That domain is already connected.");

    const api = cloudflareApi(env);
    let zoneId: string | null = null;
    if (api.configured) {
      const zone = await api.findZone(name).catch(() => null);
      zoneId = zone?.id ?? null;
    }

    const id = newId("dom");
    await db.insert(domains).values({
      id,
      ownerId: user.id,
      name,
      zoneId,
      status: "pending",
      dnsRecords: dnsRecordsFor(name),
    });

    return Response.json({ id, zoneId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
