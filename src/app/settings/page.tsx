import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes } from "@/lib/mail/mailboxes";
import { mailboxUsage } from "@/lib/mail/queries";
import { domains } from "@/lib/db/schema";
import { formatBytes, formatRelative } from "@/lib/format";
import { HealthPanel } from "@/components/settings/health-panel";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview" };

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
    <>
      <PageHeader title="Overview">This deployment runs on your Cloudflare account.</PageHeader>
      <SettingsBody flush>
        <div className="stat-strip settings-flush">
          <Stat label="Domains" value={String(domainRows.length)} />
          <Stat label="Mailboxes" value={String(mailboxes.length)} />
          <Stat label="Stored" value={formatBytes(totals.bytes)} hint={`${totals.messages} messages`} />
        </div>

        <section>
          <h2 className="settings-section-label">Mailboxes</h2>
          {usage.length === 0 ? (
            <p className="px-8 py-6 text-[13px] text-muted-foreground">
              No mailboxes yet.{" "}
              <Link href="/settings/mailboxes/new" className="hover:underline" style={{ color: "var(--primary)" }}>
                Add one
              </Link>
              .
            </p>
          ) : (
            <div className="settings-ledger">
              <div className="settings-ledger-head" aria-hidden>
                <span>Address</span>
                <span>Kind</span>
                <span>Mail</span>
                <span className="max-md:hidden">Size</span>
                <span />
              </div>
              {usage.map(({ mailbox, stats }) => (
                <div key={mailbox.id} className="settings-ledger-row">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{mailbox.address}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {mailbox.type === "external_imap"
                        ? `Synced ${formatRelative(mailbox.lastSyncedAt)}`
                        : "Cloudflare domain"}
                    </p>
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    {mailbox.type === "native" ? "Domain" : "IMAP"}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{stats.messages}</span>
                  <span className="text-[13px] text-muted-foreground max-md:hidden">
                    {formatBytes(stats.bytes)}
                  </span>
                  <div className="flex justify-end">
                    <Link href={`/mail/${mailbox.id}`} className="btn btn-ghost !h-8 !px-3">
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="settings-section-label">System checks</h2>
          <HealthPanel />
        </section>
      </SettingsBody>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p className="font-serif text-[30px] leading-none tracking-tight">{value}</p>
      {hint ? <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
