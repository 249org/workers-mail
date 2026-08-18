export const SAVED_PROFILES_KEY = "wm-login-profiles";
export const MAX_SAVED_PROFILES = 6;

export type SavedProfile = {
  email: string;
  usedAt: number;
};

export function parseSavedProfiles(value: unknown): SavedProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const profiles: SavedProfile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@") || email.length > 254 || seen.has(email)) continue;
    const usedAt = typeof record.usedAt === "number" && Number.isFinite(record.usedAt) ? record.usedAt : 0;
    seen.add(email);
    profiles.push({ email, usedAt });
  }
  return profiles.sort((a, b) => b.usedAt - a.usedAt).slice(0, MAX_SAVED_PROFILES);
}

export function readSavedProfiles(): SavedProfile[] {
  try {
    return parseSavedProfiles(JSON.parse(localStorage.getItem(SAVED_PROFILES_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function writeSavedProfiles(profiles: SavedProfile[]): SavedProfile[] {
  const next = parseSavedProfiles(profiles);
  localStorage.setItem(SAVED_PROFILES_KEY, JSON.stringify(next));
  return next;
}

export function rememberSavedProfile(email: string): SavedProfile[] {
  const normalised = email.trim().toLowerCase();
  if (!normalised.includes("@")) return readSavedProfiles();
  const rest = readSavedProfiles().filter((profile) => profile.email !== normalised);
  return writeSavedProfiles([{ email: normalised, usedAt: Date.now() }, ...rest]);
}

export function forgetSavedProfile(email: string): SavedProfile[] {
  const normalised = email.trim().toLowerCase();
  return writeSavedProfiles(readSavedProfiles().filter((profile) => profile.email !== normalised));
}
