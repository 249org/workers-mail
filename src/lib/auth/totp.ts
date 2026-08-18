import { sha256Hex, timingSafeEqualText } from "@/lib/crypto";
import { randomToken } from "@/lib/ids";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

export function generateTotpSecret(): string {
  return encodeBase32(crypto.getRandomValues(new Uint8Array(20)));
}

export function otpauthUrl(secret: string, email: string, issuer = "Workers Mail"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function totpAt(
  secret: string,
  timeMs = Date.now(),
  digits = DIGITS,
): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  return hotp(decodeBase32(secret), counter, digits);
}

export async function verifyTotp(secret: string, code: string, timeMs = Date.now()): Promise<boolean> {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  const key = decodeBase32(secret);
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const expected = await hotp(key, counter + offset, DIGITS);
    if (timingSafeEqualText(expected, normalized)) return true;
  }
  return false;
}

export async function generateRecoveryCodes(count = 8): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomToken(4).toUpperCase();
    plain.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  const hashed = await Promise.all(plain.map(hashRecoveryCode));
  return { plain, hashed };
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return sha256Hex(normalizeRecoveryCode(code));
}

export async function consumeRecoveryCode(
  storedHashes: string[],
  code: string,
): Promise<string[] | null> {
  const incoming = await hashRecoveryCode(code);
  const index = storedHashes.findIndex((hash) => timingSafeEqualText(hash, incoming));
  if (index < 0) return null;
  return storedHashes.filter((_, i) => i !== index);
}

async function hotp(key: Uint8Array<ArrayBuffer>, counter: number, digits: number): Promise<string> {
  const material = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const packed = new ArrayBuffer(8);
  const view = new DataView(packed);
  view.setUint32(4, counter >>> 0, false);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", material, packed));
  const offset = (mac[19] ?? 0) & 0x0f;
  const binary =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  const otp = binary % 10 ** digits;
  return String(otp).padStart(digits, "0");
}

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function decodeBase32(input: string): Uint8Array<ArrayBuffer> {
  const cleaned = input.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
