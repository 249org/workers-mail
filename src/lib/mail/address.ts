import type { Addr } from "@/lib/db/schema";

const ADDRESS_PATTERN = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

export function isEmailAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value.trim());
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function domainOf(address: string): string {
  return normalizeAddress(address).split("@")[1] ?? "";
}

export function localPartOf(address: string): string {
  return normalizeAddress(address).split("@")[0] ?? "";
}

/** Parses a comma-separated recipient list, tolerating `Name <a@b.c>` forms. */
export function parseAddressList(input: string): Addr[] {
  const out: Addr[] = [];
  for (const chunk of splitOutsideQuotes(input)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const angle = trimmed.match(/^(.*)<([^>]+)>$/);
    if (angle) {
      const name = angle[1]?.trim().replace(/^"|"$/g, "") ?? "";
      const address = normalizeAddress(angle[2] ?? "");
      if (isEmailAddress(address)) out.push(name ? { name, address } : { address });
      continue;
    }
    const address = normalizeAddress(trimmed);
    if (isEmailAddress(address)) out.push({ address });
  }
  return out;
}

export function formatAddress(addr: Addr): string {
  if (!addr.name) return addr.address;
  return `"${addr.name.replace(/"/g, "'")}" <${addr.address}>`;
}

export function formatAddressList(list: Addr[]): string {
  return list.map(formatAddress).join(", ");
}

export function displayName(addr: Addr | undefined): string {
  if (!addr) return "Unknown";
  return addr.name?.trim() || addr.address;
}

function splitOutsideQuotes(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    if ((char === "," || char === ";") && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}
