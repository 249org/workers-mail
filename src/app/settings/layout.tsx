import { cookies } from "next/headers";
import { and, count, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { apiKeys, contacts, domains, users } from "@/lib/db/schema";
import { type SettingsIndex } from "@/components/settings/settings-nav";
import { SettingsRuntime } from "@/components/settings/settings-runtime";
import { APPEARANCE_COOKIE, describeAppearance, parseAppearance } from "@/lib/appearance";
import { parsePrivacy } from "@/lib/privacy";
import { parseSignature } from "@/lib/signature";
import { AppToaster } from "@/components/ui/app-toaster";
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

  const privacy = parsePrivacy(accountRows[0]?.privacyPrefs);
  let signatureOn = false;
  let signatureCustom = 0;
  if (signatureStored) {
    try {
      const signature = parseSignature(JSON.parse(signatureStored));
      const perMailbox = Object.keys(signature.byMailbox);
      signatureOn = signature.enabled && Boolean(signature.text.trim() || perMailbox.length);
      signatureCustom = signature.enabled ? perMailbox.length : 0;
    } catch {
      signatureOn = false;
      signatureCustom = 0;
    }
  }

  const index: SettingsIndex = {
    appearance: describeAppearance(appearance),
    mailboxCount: mailboxes.length,
    mailboxHint: mailboxes[0]?.address ?? "None connected",
    domainCount: Number(domainRows[0]?.n ?? 0),
    contactCount: Number(contactRows[0]?.n ?? 0),
    keyCount: Number(keyRows[0]?.n ?? 0),
    twoFactor: Boolean(accountRows[0]?.totpEnabledAt),
    remoteImages: privacy.remoteImages,
    signatureOn,
    signatureCustom,
  };

  return (
    <div className="h-dvh bg-background">
      <SettingsRuntime
        index={index}
        mailboxes={mailboxes.map(publicMailbox)}
        user={{ email: user.email, name: user.name, avatarUpdatedAt: user.avatarUpdatedAt }}
      >
        {children}
      </SettingsRuntime>
      <AppToaster />
    </div>
  );
}
