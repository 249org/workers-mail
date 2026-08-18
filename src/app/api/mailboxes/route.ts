import { eq } from "drizzle-orm";
import { ApiError, authenticate, errorResponse, readJson } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { domains, mailboxes } from "@/lib/db/schema";
import { encryptSecret, EncryptionUnavailableError } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { domainOf, isEmailAddress, normalizeAddress } from "@/lib/mail/address";
import {
  ensureDefaultFolders,
  listMailboxes,
  publicMailbox,
} from "@/lib/mail/mailboxes";
import { TransportConfigError, validateImapSettings, validateSmtpSettings } from "@/lib/transport/validate";

type CreateBody = {
  type?: "native" | "external_imap";
  address?: string;
  displayName?: string;
  imap?: { host?: string; port?: number; tls?: "implicit" | "starttls"; username?: string; password?: string };
  smtp?: { host?: string; port?: number; tls?: "implicit" | "starttls"; username?: string; password?: string };
};

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const rows = await listMailboxes(db, user.id);
    return Response.json({ mailboxes: rows.map(publicMailbox) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { user, db, env } = await authenticate(request, cloudflareEnv());
    const body = await readJson<CreateBody>(request);

    const address = normalizeAddress(body.address ?? "");
    if (!isEmailAddress(address)) throw new ApiError(400, "Enter a valid email address.");

    const existing = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.address, address))
      .limit(1);
    if (existing.length > 0) throw new ApiError(409, "That address already has a mailbox.");

    const id = newId("mbx");
    const base = {
      id,
      ownerId: user.id,
      address,
      displayName: body.displayName?.trim() || null,
    };

    if (body.type === "external_imap") {
      const imap = validateImapSettings({
        host: body.imap?.host,
        port: body.imap?.port,
        tls: body.imap?.tls,
        username: body.imap?.username || address,
      });
      const smtp = validateSmtpSettings({
        host: body.smtp?.host,
        port: body.smtp?.port,
        tls: body.smtp?.tls,
        username: body.smtp?.username || imap.username,
      });
      if (!body.imap?.password) throw new ApiError(400, "An IMAP password is required.");

      const key = env.MAIL_ENCRYPTION_KEY;
      const imapPassword = await encryptSecret(body.imap.password, key);
      const smtpPassword = await encryptSecret(body.smtp?.password || body.imap.password, key);

      await db.insert(mailboxes).values({
        ...base,
        type: "external_imap",
        imapHost: imap.host,
        imapPort: imap.port,
        imapTls: imap.tls,
        imapUser: imap.username,
        imapPassword,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpTls: smtp.tls,
        smtpUser: smtp.username,
        smtpPassword,
      });
    } else {
      const domainRows = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.name, domainOf(address)))
        .limit(1);
      const domain = domainRows[0];
      if (!domain) {
        throw new ApiError(400, `Add ${domainOf(address)} as a domain before creating this mailbox.`);
      }

      await db.insert(mailboxes).values({ ...base, type: "native", domainId: domain.id });
    }

    await ensureDefaultFolders(db, id);

    const created = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
    const mailbox = created[0];
    if (!mailbox) throw new ApiError(500, "Mailbox was not persisted");

    return Response.json({ mailbox: publicMailbox(mailbox) }, { status: 201 });
  } catch (error) {
    if (error instanceof TransportConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EncryptionUnavailableError) {
      return Response.json(
        { error: "Set the MAIL_ENCRYPTION_KEY secret before connecting an IMAP mailbox." },
        { status: 503 },
      );
    }
    return errorResponse(error);
  }
}
