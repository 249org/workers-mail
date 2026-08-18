import { cookies } from "next/headers";
import { and, count, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { apiKeys, contacts, domains } from "@/lib/db/schema";
import { AppHeader } from "@/components/app-header";
import { SettingsNav, type SettingsIndex } from "@/components/settings/settings-nav";
import {
  APPEARANCE_COOKIE,
  PALETTES,
  SCHEMES,
  parseAppearance,
} from "@/lib/appearance";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user, db } = await requireUser();
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);

  const [mailboxes, domainRows, contactRows, keyRows] = await Promise.all([
    listMailboxes(db, user.id),
    db.select({ n: count() }).from(domains).where(eq(domains.ownerId, user.id)),
    db.select({ n: count() }).from(contacts).where(eq(contacts.ownerId, user.id)),
    db
      .select({ n: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.ownerId, user.id), isNull(apiKeys.revokedAt))),
  ]);

  const palette = PALETTES.find((item) => item.id === appearance.palette)?.name ?? "Meridian";
  const scheme = SCHEMES.find((item) => item.id === appearance.scheme)?.name ?? "System";

  const index: SettingsIndex = {
    appearance: `${palette} · ${scheme}`,
    mailboxCount: mailboxes.length,
    mailboxHint: mailboxes[0]?.address ?? "None connected",
    domainCount: Number(domainRows[0]?.n ?? 0),
    contactCount: Number(contactRows[0]?.n ?? 0),
    keyCount: Number(keyRows[0]?.n ?? 0),
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader
        email={user.email}
        name={user.name}
        mailboxes={mailboxes.map(publicMailbox)}
        context="settings"
      />

      <div className="settings-shell">
        <SettingsNav index={index} />
        <main className="settings-spread">{children}</main>
      </div>
    </div>
  );
}
