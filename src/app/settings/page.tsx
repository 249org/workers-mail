import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { mailboxUsage } from "@/lib/mail/queries";
import { domains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { formatBytes, formatRelative } from "@/lib/format";
import { HealthPanel } from "@/components/settings/health-panel";

export default async function SettingsOverviewPage() {
  const { user, db } = await requireUser();

  const [mailboxes, domainRows] = await Promise.all([
    listMailboxes(db, user.id),
    db.select().from(domains).where(eq(domains.ownerId, user.id)),
  ]);

  const usage = await Promise.all(
    mailboxes.map(async (mailbox) => ({
      mailbox,
      stats: await mailboxUsage(db, mailbox.id),
    })),
  );

  const totals = usage.reduce(
    (sum, entry) => ({
      messages: sum.messages + entry.stats.messages,
      bytes: sum.bytes + entry.stats.bytes,
    }),
    { messages: 0, bytes: 0 },
  );

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Signed in as {user.email}. This deployment runs entirely on your Cloudflare account.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Domains" value={String(domainRows.length)} />
        <Stat label="Mailboxes" value={String(mailboxes.length)} />
        <Stat label="Stored" value={formatBytes(totals.bytes)} hint={`${totals.messages} messages`} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Mailboxes</h2>
        {usage.length === 0 ? (
          <p className="card mt-3 p-4 text-sm text-[var(--ink-muted)]">
            No mailboxes yet.{" "}
            <Link href="/settings/mailboxes/new" className="text-[var(--accent)] hover:underline">
              Add one
            </Link>
            .
          </p>
        ) : (
          <ul className="card mt-3 divide-y divide-[var(--border)]">
            {usage.map(({ mailbox, stats }) => (
              <li key={mailbox.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{mailbox.address}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {mailbox.type === "native" ? "Cloudflare domain" : "External IMAP"} ·{" "}
                    {stats.messages} messages · {formatBytes(stats.bytes)}
                    {mailbox.type === "external_imap" &&
                      ` · synced ${formatRelative(mailbox.lastSyncedAt)}`}
                  </p>
                </div>
                <Link href={`/mail/${mailbox.id}`} className="btn btn-ghost shrink-0 !py-1.5 text-xs">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">System checks</h2>
        <HealthPanel />
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="label mb-1">{label}</p>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{hint}</p>}
    </div>
  );
}
