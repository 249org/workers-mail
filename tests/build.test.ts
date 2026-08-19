import { describe, expect, it } from "vitest";
import { buildRawMessage, generateMessageId } from "@/lib/mail/build";

const base = {
  from: { name: "Sam", address: "sam@example.com" },
  to: [{ address: "dest@example.org" }],
  subject: "Hello",
  text: "Body text",
  messageId: "abc@example.com",
  date: new Date("2024-01-02T03:04:05Z"),
};

describe("buildRawMessage", () => {
  it("writes the standard headers with CRLF line endings", () => {
    const raw = buildRawMessage(base);
    expect(raw).toContain('From: "Sam" <sam@example.com>\r\n');
    expect(raw).toContain("To: dest@example.org\r\n");
    expect(raw).toContain("Message-ID: <abc@example.com>\r\n");
    expect(raw).toContain("MIME-Version: 1.0\r\n");
  });

  it("encodes non-ASCII subjects per RFC 2047", () => {
    const raw = buildRawMessage({ ...base, subject: "Grüße" });
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).not.toContain("Subject: Grüße");
  });

  it("uses multipart/alternative when an HTML body is supplied", () => {
    const raw = buildRawMessage({ ...base, html: "<p>Body</p>" });
    expect(raw).toContain("Content-Type: multipart/alternative");
    expect(raw).toContain('Content-Type: text/html; charset="utf-8"');
  });

  it("wraps attachments in multipart/mixed and closes every boundary", () => {
    const raw = buildRawMessage({
      ...base,
      attachments: [
        { filename: "note.txt", mimeType: "text/plain", content: new TextEncoder().encode("hi") },
      ],
    });
    const boundary = raw.match(/boundary="(mixed_[a-f0-9]+)"/)?.[1];
    expect(boundary).toBeDefined();
    expect(raw).toContain(`--${boundary}--`);
    expect(raw).toContain('filename="note.txt"');
  });

  it("embeds an inline profile photo with a Content-ID", () => {
    const raw = buildRawMessage({
      ...base,
      html: "<p>Hello</p>",
      attachments: [
        {
          filename: "profile.jpg",
          mimeType: "image/jpeg",
          content: new Uint8Array([0xff, 0xd8, 0xff]),
          contentId: "profile-photo@workers-mail",
          inline: true,
        },
      ],
    });
    expect(raw).toContain("Content-Type: multipart/related");
    expect(raw).toContain("Content-ID: <profile-photo@workers-mail>");
    expect(raw).toContain("Content-Disposition: inline");
    expect(raw).not.toContain("Content-Type: multipart/mixed");
  });

  it("carries reply threading headers", () => {
    const raw = buildRawMessage({ ...base, inReplyTo: "parent@example.com", references: ["parent@example.com"] });
    expect(raw).toContain("In-Reply-To: <parent@example.com>");
    expect(raw).toContain("References: <parent@example.com>");
  });

  it("keeps base64 lines within the 76 character limit", () => {
    const raw = buildRawMessage({ ...base, text: "x".repeat(500) });
    const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    for (const line of body.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });
});

describe("generateMessageId", () => {
  it("anchors the id to the sending domain", () => {
    expect(generateMessageId("example.com")).toMatch(/^[a-f0-9]{32}@example\.com$/);
  });
});
