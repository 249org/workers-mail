import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encode } from "uqr";

/*
 * The encoder is checked by reading its output back with a different implementation.
 * A QR that renders but carries the wrong bytes looks exactly like a working one on
 * screen, and the person who scans it only finds out when their codes never match.
 */
function decode(text: string, scale = 6): string | null {
  const code = encode(text, { ecc: "M", border: 2 });
  const px = code.size * scale;
  const rgba = new Uint8ClampedArray(px * px * 4);
  for (let y = 0; y < px; y += 1) {
    for (let x = 0; x < px; x += 1) {
      const dark = code.data[Math.floor(y / scale)]?.[Math.floor(x / scale)];
      const at = (y * px + x) * 4;
      const value = dark ? 0 : 255;
      rgba[at] = value;
      rgba[at + 1] = value;
      rgba[at + 2] = value;
      rgba[at + 3] = 255;
    }
  }
  return jsQR(rgba, px, px)?.data ?? null;
}

const uri = (secret: string, account: string) =>
  `otpauth://totp/Workers%20Mail:${encodeURIComponent(account)}?secret=${secret}` +
  `&issuer=Workers%20Mail&algorithm=SHA1&digits=6&period=30`;

describe("the authenticator QR", () => {
  it("carries the setup URI exactly", () => {
    const text = uri("IQCW36P3KUONE5QJOKWY42FZD5LX65C4", "support@mena-speakers.com");
    expect(decode(text)).toBe(text);
  });

  it("survives the addresses a real account can have", () => {
    for (const account of [
      "a@b.co",
      "someone.with.a.long.local.part@a-rather-long-domain-name.example.com",
      "user+tag@example.org",
    ]) {
      const text = uri("VDID5ZIO4MPKUXNN7Q2T6SA5FFHTH2IM", account);
      expect(decode(text)).toBe(text);
    }
  });

  it("keeps the secret intact, character for character", () => {
    // A single wrong character is a code that never matches and an account locked out.
    const secret = "ZXCVBNM234567ASDFGHJKLQWERTYUIOP";
    const decoded = decode(uri(secret, "dev@localhost.test"));
    expect(decoded).toContain(`secret=${secret}`);
  });

  it("draws a quiet zone, which a scanner needs to find the edges", () => {
    const code = encode(uri("ABCDEFGHIJKLMNOP", "a@b.co"), { ecc: "M", border: 2 });
    for (const x of [0, 1, code.size - 2, code.size - 1]) {
      expect(code.data[0]?.[x]).toBe(false);
      expect(code.data[code.size - 1]?.[x]).toBe(false);
    }
  });
});
