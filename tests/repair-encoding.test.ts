import { describe, expect, it } from "vitest";
import { repairOrphanedEncoding } from "@/lib/mail/repair-encoding";

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

describe("repairOrphanedEncoding", () => {
  it("decodes a body whose encoding header leaked below the headers", () => {
    const broken = `Content-Transfer-Encoding: base64\r\n\r\n${b64("Will look at it.")}`;
    expect(repairOrphanedEncoding(broken)).toBe("Will look at it.");
  });

  it("repairs the space-collapsed form stored in snippets", () => {
    const snippet = `Content-Transfer-Encoding: base64 ${b64("Will look at it tomorrow.")}`;
    expect(repairOrphanedEncoding(snippet)).toBe("Will look at it tomorrow.");
  });

  it("restores non-ascii text", () => {
    const broken = `Content-Transfer-Encoding: base64\r\n\r\n${b64("Café — 日本語 👋")}`;
    expect(repairOrphanedEncoding(broken)).toBe("Café — 日本語 👋");
  });

  it("decodes what it can from a truncated snippet", () => {
    const full = b64("The quick brown fox jumps over the lazy dog many times over");
    const snippet = `Content-Transfer-Encoding: base64 ${full.slice(0, 40)}`;
    expect(repairOrphanedEncoding(snippet)).toMatch(/^The quick brown/);
  });

  it("handles quoted-printable too", () => {
    const broken = "Content-Transfer-Encoding: quoted-printable\r\n\r\nCaf=C3=A9 time";
    expect(repairOrphanedEncoding(broken)).toBe("Café time");
  });

  it("leaves a healthy body untouched", () => {
    expect(repairOrphanedEncoding("Hello there.")).toBe("Hello there.");
    expect(repairOrphanedEncoding("")).toBe("");
  });

  it("does not touch a body that merely mentions the header", () => {
    const text = "The fix was to move Content-Transfer-Encoding: base64 into the headers.";
    expect(repairOrphanedEncoding(text)).toBe(text);
  });

  it("keeps the original when the payload is not really base64", () => {
    const text = "Content-Transfer-Encoding: base64\r\n\r\n!!!!";
    expect(repairOrphanedEncoding(text)).toBe(text);
  });
});
