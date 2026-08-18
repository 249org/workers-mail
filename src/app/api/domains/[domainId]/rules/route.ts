import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { domains, routingRules } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { isEmailAddress, normalizeAddress } from "@/lib/mail/address";
import { getOwnedMailbox } from "@/lib/mail/mailboxes";
import { cloudflareApi } from "@/lib/cloudflare/api";

type Params = { params: Promise<{ domainId: string }> };
type RuleBody = {
  matchType?: "address" | "catch_all";
  matchValue?: string;
  action?: "mailbox" | "forward" | "drop";
  targetMailboxId?: string;
  forwardTo?: string;
  position?: number;
};

export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { domainId } = await params;
    await requireDomain(db, user.id, domainId);

    const rules = await db
      .select()
      .from(routingRules)
      .where(eq(routingRules.domainId, domainId))
      .orderBy(asc(routingRules.position));
    return Response.json({ rules });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const { domainId } = await params;
    const domain = await requireDomain(db, user.id, domainId);
    const body = await readJson<RuleBody>(request);

    if (!body.matchType || !body.action) {
      throw new ApiError(400, "matchType and action are required");
    }

    let matchValue: string | null = null;
    if (body.matchType === "address") {
      matchValue = normalizeAddress(body.matchValue ?? "");
      if (!isEmailAddress(matchValue)) throw new ApiError(400, "Enter a valid address to match.");
    }

    if (body.action === "mailbox") {
      if (!body.targetMailboxId) throw new ApiError(400, "Choose a destination mailbox.");
      if (!(await getOwnedMailbox(db, user.id, body.targetMailboxId))) {
        throw new ApiError(404, "Destination mailbox not found");
      }
    }
    if (body.action === "forward" && !isEmailAddress(body.forwardTo ?? "")) {
      throw new ApiError(400, "Enter a valid forwarding address.");
    }

    const id = newId("rul");
    await db.insert(routingRules).values({
      id,
      domainId,
      matchType: body.matchType,
      matchValue,
      action: body.action,
      targetMailboxId: body.action === "mailbox" ? (body.targetMailboxId ?? null) : null,
      forwardTo: body.action === "forward" ? normalizeAddress(body.forwardTo ?? "") : null,
      position: body.position ?? (body.matchType === "catch_all" ? 900 : 100),
    });

    // Mirror a catch-all into Email Routing so unmatched mail actually reaches this Worker.
    if (body.matchType === "catch_all" && domain.zoneId) {
      const api = cloudflareApi(env);
      if (api.configured) {
        await api
          .setCatchAllToWorker(domain.zoneId, process.env.WORKER_SCRIPT_NAME ?? "workers-mail")
          .catch(() => undefined);
      }
    }

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { domainId } = await params;
    await requireDomain(db, user.id, domainId);

    const ruleId = new URL(request.url).searchParams.get("rule");
    if (!ruleId) throw new ApiError(400, "rule is required");

    await db
      .delete(routingRules)
      .where(and(eq(routingRules.id, ruleId), eq(routingRules.domainId, domainId)));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function requireDomain(
  db: Database,
  ownerId: string,
  domainId: string,
) {
  const rows = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.ownerId, ownerId)))
    .limit(1);
  const domain = rows[0];
  if (!domain) throw new ApiError(404, "Domain not found");
  return domain;
}
