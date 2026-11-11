import { authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { unreadByMailbox } from "@/lib/mail/queries";

/** Unread waiting across every mailbox, for the count drawn on the tab icon. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { user, db } = await authenticate(request, cloudflareEnv());
    const [owned, counts] = await Promise.all([
      listMailboxes(db, user.id),
      unreadByMailbox(db, user.id),
    ]);

    // Driven off the mailbox list so one with nothing unread still reports a zero.
    const perMailbox = owned.map((mailbox) => ({
      id: mailbox.id,
      unread: counts.get(mailbox.id) ?? 0,
    }));

    return Response.json(
      {
        total: perMailbox.reduce((sum, entry) => sum + entry.unread, 0),
        mailboxes: perMailbox,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
