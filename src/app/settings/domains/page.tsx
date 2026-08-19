import { asc, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { domains, routingRules } from "@/lib/db/schema";
import { listMailboxes, publicMailbox } from "@/lib/mail/mailboxes";
import { DomainManager } from "@/components/settings/domain-manager";
import { PageHeader, SettingsBody } from "@/components/settings/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Domains" };

export default async function DomainsPage() {
  const { user, db } = await requireUser();

  const domainRows = await db
    .select()
    .from(domains)
    .where(eq(domains.ownerId, user.id))
    .orderBy(asc(domains.name));

  const rules = domainRows.length
    ? await db
        .select()
        .from(routingRules)
        .where(inArray(routingRules.domainId, domainRows.map((domain) => domain.id)))
        .orderBy(asc(routingRules.position))
    : [];

  const mailboxes = await listMailboxes(db, user.id);

  return (
    <>
      <PageHeader title="Domains">
        Connect a domain you already run on Cloudflare. Verification enables Email Routing and
        points your addresses at this Worker.
      </PageHeader>
      <SettingsBody flush>
        <DomainManager
        domains={domainRows.map((domain) => ({
          id: domain.id,
          name: domain.name,
          zoneId: domain.zoneId,
          status: domain.status,
          routingEnabled: domain.routingEnabled,
          sendingEnabled: domain.sendingEnabled,
          dnsRecords: domain.dnsRecords ?? [],
          bimiLogoUrl: domain.bimiLogoUrl,
          bimiCertUrl: domain.bimiCertUrl,
          lastCheckedAt: domain.lastCheckedAt,
          rules: rules
            .filter((rule) => rule.domainId === domain.id)
            .map((rule) => ({
              id: rule.id,
              matchType: rule.matchType,
              matchValue: rule.matchValue,
              action: rule.action,
              targetMailboxId: rule.targetMailboxId,
              forwardTo: rule.forwardTo,
            })),
        }))}
        mailboxes={mailboxes.map(publicMailbox)}
      />
      </SettingsBody>
    </>
  );
}
