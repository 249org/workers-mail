import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  EncryptionUnavailableError,
  hashPassword,
  verifyPassword,
} from "@/lib/crypto";

const KEY = "test-encryption-key";

describe("secret encryption", () => {
  it("round trips a value", async () => {
    const sealed = await encryptSecret("hunter2", KEY);
    expect(sealed).not.toContain("hunter2");
    expect(await decryptSecret(sealed, KEY)).toBe("hunter2");
  });

  it("produces a different ciphertext each time", async () => {
    expect(await encryptSecret("same", KEY)).not.toBe(await encryptSecret("same", KEY));
  });

  it("fails closed when no key is configured", async () => {
    await expect(encryptSecret("x", undefined)).rejects.toThrow(EncryptionUnavailableError);
  });

  it("refuses to decrypt with the wrong key", async () => {
    const sealed = await encryptSecret("hunter2", KEY);
    await expect(decryptSecret(sealed, "other-key")).rejects.toThrow();
  });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("salts each hash independently", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("stores a Worker-legal iteration count", async () => {
    const stored = await hashPassword("secret");
    expect(stored.split("$")[1]).toBe("100000");
  });
});
