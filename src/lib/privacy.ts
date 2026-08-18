import type { PrivacyPrefs } from "@/lib/db/schema";

export type { PrivacyPrefs };

export const DEFAULT_PRIVACY: PrivacyPrefs = {
  remoteImages: "ask",
  collectContacts: true,
};

export const SESSION_TTL_DAYS = [1, 7, 30] as const;
export type SessionTtlDays = (typeof SESSION_TTL_DAYS)[number];

export function parsePrivacy(value: unknown): PrivacyPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_PRIVACY };
  const record = value as Record<string, unknown>;
  return {
    remoteImages: record.remoteImages === "allow" ? "allow" : "ask",
    collectContacts: record.collectContacts !== false,
  };
}

export function parseSessionTtlDays(value: unknown): SessionTtlDays {
  return SESSION_TTL_DAYS.includes(value as SessionTtlDays) ? (value as SessionTtlDays) : 30;
}

export function sessionTtlSeconds(days: SessionTtlDays): number {
  return days * 60 * 60 * 24;
}
