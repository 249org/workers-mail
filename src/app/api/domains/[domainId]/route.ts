import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { domains } from "@/lib/db/schema";

type Params = { params: Promise<{ domainId: string }> };
type PatchBody = { bimiLogoUrl?: string | null; bimiCertUrl?: string | null };

/** Stores the BIMI logo and certificate URLs the DNS record is generated from. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { domainId } = await params;

    const rows = await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.ownerId, user.id)))
      .limit(1);
    if (rows.length === 0) throw new ApiError(404, "Domain not found");

    const body = await readJson<PatchBody>(request);
    await db
      .update(domains)
      .set({
        bimiLogoUrl: httpsUrlOrNull(body.bimiLogoUrl, "logo"),
        bimiCertUrl: httpsUrlOrNull(body.bimiCertUrl, "certificate"),
      })
      .where(eq(domains.id, domainId));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function httpsUrlOrNull(value: string | null | undefined, label: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^https:\/\//i.test(trimmed)) {
    throw new ApiError(400, `The ${label} URL must start with https://`);
  }
  return trimmed;
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const { domainId } = await params;

    const rows = await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.ownerId, user.id)))
      .limit(1);
    if (rows.length === 0) throw new ApiError(404, "Domain not found");

    await db.delete(domains).where(eq(domains.id, domainId));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
