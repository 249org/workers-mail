import { describe, expect, it } from "vitest";
import { buildRawMessage } from "@/lib/mail/build";
import { parseMime } from "@/lib/mail/mime";

const base = {
  from: { name: "Ayman", address: "support@mena-speakers.com" },
  to: [{ address: "connect@mena-speakers.com" }],
  subject: "Re: A Standing Ovation",
  messageId: "abc@mena-speakers.com",
  date: new Date("2026-08-19T14:56:00Z"),
};

describe("round trip", () => {
  it("decodes a plain text body instead of leaking the encoding header", async () => {
    const raw = buildRawMessage({ ...base, text: "Will look at it tomorrow." });
    const parsed = await parseMime(raw);
    expect(parsed.text.trim()).toBe("Will look at it tomorrow.");
    expect(parsed.text).not.toContain("Content-Transfer-Encoding");
  });

  it("keeps Content-Transfer-Encoding above the header blank line", () => {
    const raw = buildRawMessage({ ...base, text: "hi" });
    const [head] = raw.split("\r\n\r\n");
    expect(head).toContain("Content-Transfer-Encoding: base64");
  });

  it("decodes an html body", async () => {
    const raw = buildRawMessage({ ...base, text: "plain", html: "<p>rich</p>" });
    const parsed = await parseMime(raw);
    expect(parsed.html).toContain("rich");
    expect(parsed.text.trim()).toBe("plain");
  });

  it("decodes body and attachment together", async () => {
    const raw = buildRawMessage({
      ...base,
      text: "see attached",
      attachments: [
        { filename: "n.txt", mimeType: "text/plain", content: new TextEncoder().encode("hello") },
      ],
    });
    const parsed = await parseMime(raw);
    expect(parsed.text.trim()).toBe("see attached");
    expect(parsed.attachments[0]?.filename).toBe("n.txt");
    expect(new TextDecoder().decode(parsed.attachments[0]!.content)).toBe("hello");
  });

  it("decodes non-ascii text", async () => {
    const raw = buildRawMessage({ ...base, text: "Café — 日本語 👋" });
    const parsed = await parseMime(raw);
    expect(parsed.text.trim()).toBe("Café — 日本語 👋");
  });
});
