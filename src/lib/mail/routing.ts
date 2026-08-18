import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { domains, mailboxes, routingRules } from "@/lib/db/schema";
import { domainOf, normalizeAddress } from "./address";

export type RoutingDecision =
  | { action: "deliver"; mailboxId: string; ownerId: string }
  | { action: "forward"; forwardTo: string }
  | { action: "drop"; reason: string };

/**
 * Decides where an inbound recipient address goes. An exact mailbox on a known domain
 * wins; otherwise the domain's rules are consulted in order, with catch-all last.
 */
export async function resolveRecipient(
  db: Database,
  recipient: string,
): Promise<RoutingDecision> {
  const address = normalizeAddress(recipient);
  const domainName = domainOf(address);
  if (!domainName) return { action: "drop", reason: "Malformed recipient" };

  const domainRows = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.name, domainName))
    .limit(1);
  const domain = domainRows[0];
  if (!domain) return { action: "drop", reason: `No domain configured for ${domainName}` };

  const direct = await db
    .select({ id: mailboxes.id, ownerId: mailboxes.ownerId })
    .from(mailboxes)
    .where(and(eq(mailboxes.address, address), eq(mailboxes.type, "native")))
    .limit(1);
  const mailbox = direct[0];
  if (mailbox) return { action: "deliver", mailboxId: mailbox.id, ownerId: mailbox.ownerId };

  const rules = await db
    .select()
    .from(routingRules)
    .where(and(eq(routingRules.domainId, domain.id), eq(routingRules.enabled, true)))
    .orderBy(asc(routingRules.position));

  for (const rule of rules) {
    const matches =
      rule.matchType === "catch_all" ||
      (rule.matchValue ? normalizeAddress(rule.matchValue) === address : false);
    if (!matches) continue;

    if (rule.action === "drop") return { action: "drop", reason: "Matched drop rule" };
    if (rule.action === "forward" && rule.forwardTo) {
      return { action: "forward", forwardTo: rule.forwardTo };
    }
    if (rule.action === "mailbox" && rule.targetMailboxId) {
      const target = await db
        .select({ id: mailboxes.id, ownerId: mailboxes.ownerId })
        .from(mailboxes)
        .where(eq(mailboxes.id, rule.targetMailboxId))
        .limit(1);
      const found = target[0];
      if (found) return { action: "deliver", mailboxId: found.id, ownerId: found.ownerId };
    }
  }

  return { action: "drop", reason: `No route matched ${address}` };
}

/** Confirms the caller may use an address in the From header of an outbound message. */
export async function canSendAs(
  db: Database,
  ownerId: string,
  address: string,
): Promise<boolean> {
  const normalized = normalizeAddress(address);
  const rows = await db
    .select({ id: mailboxes.id, type: mailboxes.type, domainId: mailboxes.domainId })
    .from(mailboxes)
    .where(and(eq(mailboxes.ownerId, ownerId), eq(mailboxes.address, normalized)))
    .limit(1);

  const mailbox = rows[0];
  if (!mailbox) return false;
  if (mailbox.type === "external_imap") return true;
  if (!mailbox.domainId) return false;

  const domainRows = await db
    .select({ sendingEnabled: domains.sendingEnabled })
    .from(domains)
    .where(eq(domains.id, mailbox.domainId))
    .limit(1);
  return domainRows[0]?.sendingEnabled ?? false;
}
