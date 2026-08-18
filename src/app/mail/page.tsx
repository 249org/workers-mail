import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { ensureDefaultFolders, listMailboxes } from "@/lib/mail/mailboxes";

export default async function MailIndexPage() {
  const { user, db } = await requireUser();
  const mailboxes = await listMailboxes(db, user.id);

  const first = mailboxes[0];
  if (first) {
    const folders = await ensureDefaultFolders(db, first.id);
    const inbox = folders.find((folder) => folder.role === "inbox") ?? folders[0];
    if (inbox) redirect(`/mail/${first.id}/${inbox.id}`);
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="panel relative max-w-md p-8 text-center">
        <span className="reg reg-tl" aria-hidden />
        <span className="reg reg-tr" aria-hidden />
        <span className="reg reg-bl" aria-hidden />
        <span className="reg reg-br" aria-hidden />
        <div className="icon-well mx-auto mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="1" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <h2 className="text-[15px] font-semibold">No mailboxes yet</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Link Gmail or Outlook, or create an address on a domain you already run.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/settings/mailboxes/new" className="btn btn-primary">
            Link an inbox
          </Link>
          <Link href="/settings/domains" className="btn btn-ghost">
            Add a domain
          </Link>
        </div>
      </div>
    </div>
  );
}
