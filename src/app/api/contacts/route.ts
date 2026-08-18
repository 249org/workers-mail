import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { contacts } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { isEmailAddress, normalizeAddress } from "@/lib/mail/address";

type UpsertBody = { email?: string; name?: string; notes?: string };

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase();

    const filters = [eq(contacts.ownerId, user.id)];
    if (query) {
      const needle = `%${query}%`;
      const match = or(
        like(sql`lower(${contacts.email})`, needle),
        like(sql`lower(${contacts.name})`, needle),
      );
      if (match) filters.push(match);
    }

    const rows = await db
      .select()
      .from(contacts)
      .where(and(...filters))
      .orderBy(desc(contacts.lastSeenAt))
      .limit(200);
    return Response.json({ contacts: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const body = await readJson<UpsertBody>(request);
    const email = normalizeAddress(body.email ?? "");
    if (!isEmailAddress(email)) throw new ApiError(400, "Enter a valid email address.");

    await db
      .insert(contacts)
      .values({
        id: newId("con"),
        ownerId: user.id,
        email,
        name: body.name?.trim() || null,
        notes: body.notes?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [contacts.ownerId, contacts.email],
        set: { name: body.name?.trim() || null, notes: body.notes?.trim() || null },
      });

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "id is required");

    await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.ownerId, user.id)));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
