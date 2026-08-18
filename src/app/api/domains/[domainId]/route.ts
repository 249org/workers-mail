import { and, eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { domains } from "@/lib/db/schema";

type Params = { params: Promise<{ domainId: string }> };

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
