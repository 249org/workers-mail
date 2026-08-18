import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { mailboxUsage } from "@/lib/mail/queries";
import { domains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { formatBytes, formatRelative } from "@/lib/format";
import { HealthPanel } from "@/components/settings/health-panel";
import { PageHeader } from "@/components/settings/page-header";

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
      <PageHeader title="Overview">
        This deployment runs on your Cloudflare account.
      </PageHeader>

      <div className="stat-strip relative">
        <span className="reg reg-tl" aria-hidden />
        <span className="reg reg-tr" aria-hidden />
        <span className="reg reg-bl" aria-hidden />
        <span className="reg reg-br" aria-hidden />
        <Stat label="Domains" value={String(domainRows.length)} />
        <Stat label="Mailboxes" value={String(mailboxes.length)} />
        <Stat label="Stored" value={formatBytes(totals.bytes)} hint={`${totals.messages} messages`} />
      </div>

      <section className="mt-8">
        <h2 className="section-title">Mailboxes</h2>
        {usage.length === 0 ? (
          <p className="list-frame mt-3 p-4 text-[13px] text-muted-foreground">
            No mailboxes yet.{" "}
            <Link href="/settings/mailboxes/new" className="text-[var(--accent)] hover:underline">
              Add one
            </Link>
            .
          </p>
        ) : (
          <ul className="list-frame mt-3">
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
        <h2 className="section-title">System checks</h2>
        <HealthPanel />
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p className="font-serif text-[30px] leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
