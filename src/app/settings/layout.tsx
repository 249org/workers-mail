import { cookies } from "next/headers";
import { and, count, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { apiKeys, contacts, domains, users } from "@/lib/db/schema";
import { AppHeader } from "@/components/app-header";
import { type SettingsIndex } from "@/components/settings/settings-nav";
import { SettingsRuntime } from "@/components/settings/settings-runtime";
import {
  APPEARANCE_COOKIE,
  PALETTES,
  SCHEMES,
  parseAppearance,
} from "@/lib/appearance";
import { parsePrivacy } from "@/lib/privacy";
import { parseSignature } from "@/lib/signature";
import { Toaster } from "sonner";
import { privateMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = privateMetadata("Settings");

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user, db, env: cloudflare } = await requireUser();
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);

  const [mailboxes, domainRows, contactRows, keyRows, accountRows, signatureStored] = await Promise.all([
    listMailboxes(db, user.id),
    db.select({ n: count() }).from(domains).where(eq(domains.ownerId, user.id)),
    db.select({ n: count() }).from(contacts).where(eq(contacts.ownerId, user.id)),
    db
      .select({ n: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.ownerId, user.id), isNull(apiKeys.revokedAt))),
    db
      .select({ totpEnabledAt: users.totpEnabledAt, privacyPrefs: users.privacyPrefs })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    cloudflare.SESSION_STORE.get(`signature:${user.id}`),
  ]);

  const palette = PALETTES.find((item) => item.id === appearance.palette)?.name ?? "Meridian";
  const scheme = SCHEMES.find((item) => item.id === appearance.scheme)?.name ?? "System";

  const privacy = parsePrivacy(accountRows[0]?.privacyPrefs);
  let signatureOn = false;
  if (signatureStored) {
    try {
      const signature = parseSignature(JSON.parse(signatureStored));
      signatureOn = signature.enabled && Boolean(signature.text.trim() || Object.keys(signature.byMailbox).length);
    } catch {
      signatureOn = false;
    }
  }

  const index: SettingsIndex = {
    appearance: `${palette} · ${scheme}`,
    mailboxCount: mailboxes.length,
    mailboxHint: mailboxes[0]?.address ?? "None connected",
    domainCount: Number(domainRows[0]?.n ?? 0),
    contactCount: Number(contactRows[0]?.n ?? 0),
    keyCount: Number(keyRows[0]?.n ?? 0),
    twoFactor: Boolean(accountRows[0]?.totpEnabledAt),
    remoteImages: privacy.remoteImages,
    signatureOn,
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader
        email={user.email}
        name={user.name}
        mailboxes={mailboxes.map(publicMailbox)}
        context="settings"
      />

      <SettingsRuntime index={index}>{children}</SettingsRuntime>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            boxShadow: "var(--shadow-pop)",
            borderRadius: "4px",
          },
        }}
      />
    </div>
  );
}
