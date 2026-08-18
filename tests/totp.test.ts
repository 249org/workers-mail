import { describe, expect, it } from "vitest";
import {
  consumeRecoveryCode,
  decodeBase32,
  encodeBase32,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  totpAt,
  verifyTotp,
} from "@/lib/auth/totp";

describe("totp", () => {
  it("round-trips base32", () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
  });

  it("matches RFC 6238 SHA-1 vectors at 6 digits", async () => {
    const secret = encodeBase32(new TextEncoder().encode("12345678901234567890"));
    expect(await totpAt(secret, 59 * 1000)).toBe("287082");
    expect(await totpAt(secret, 1111111109 * 1000)).toBe("081804");
  });

  it("accepts the current window and rejects a stale code", async () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = await totpAt(secret, now);
    expect(await verifyTotp(secret, code, now)).toBe(true);
    expect(await verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(await verifyTotp(secret, code, now + 90_000)).toBe(false);
    expect(await verifyTotp(secret, "000000", now)).toBe(false);
  });

  it("builds an otpauth URL for authenticator apps", () => {
    const url = otpauthUrl("JBSWY3DPEHPK3PXP", "ops@example.com");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("ops%40example.com");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("consumes a matching recovery code once", async () => {
    const hashes = [await hashRecoveryCode("ABCD-EF12"), await hashRecoveryCode("9999-0000")];
    const remaining = await consumeRecoveryCode(hashes, "abcd ef12");
    expect(remaining).toEqual([hashes[1]]);
    expect(await consumeRecoveryCode(remaining!, "ABCD-EF12")).toBeNull();
  });
});
