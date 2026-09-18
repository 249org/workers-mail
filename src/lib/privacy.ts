import type { PrivacyPrefs } from "@/lib/db/schema";

export type { PrivacyPrefs };

export const DEFAULT_PRIVACY: PrivacyPrefs = {
  remoteImages: "ask",
  collectContacts: true,
};

export const SESSION_TTL_DAYS = [1, 7, 30] as const;
export type SessionTtlDays = (typeof SESSION_TTL_DAYS)[number];

/** A mailbox is worth more than the convenience of staying signed in for a month. */
export const DEFAULT_SESSION_TTL_DAYS: SessionTtlDays = 1;

/** The longest anyone can choose, which is what the session index has to outlive. */
export const MAX_SESSION_TTL_DAYS: SessionTtlDays =
  SESSION_TTL_DAYS[SESSION_TTL_DAYS.length - 1] ?? 30;

export function parsePrivacy(value: unknown): PrivacyPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_PRIVACY };
  const record = value as Record<string, unknown>;
  return {
    remoteImages: record.remoteImages === "allow" ? "allow" : "ask",
    collectContacts: record.collectContacts !== false,
  };
}

export function parseSessionTtlDays(value: unknown): SessionTtlDays {
  return SESSION_TTL_DAYS.includes(value as SessionTtlDays)
    ? (value as SessionTtlDays)
    : DEFAULT_SESSION_TTL_DAYS;
}

export function sessionTtlSeconds(days: SessionTtlDays): number {
  return days * 60 * 60 * 24;
}
