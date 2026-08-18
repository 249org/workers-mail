import { describe, expect, it } from "vitest";
import { presetById, presetFor } from "@/lib/transport/presets";

describe("presetFor", () => {
  it("matches consumer domains", () => {
    expect(presetFor("ada@gmail.com")?.imapHost).toBe("imap.gmail.com");
    expect(presetFor("ada@one.com")?.smtpHost).toBe("send.one.com");
  });

  it("does not guess imap.{domain} for custom domains", () => {
    expect(presetFor("hello@mena-speakers.com")).toBeNull();
  });
});

describe("presetById", () => {
  it("returns one.com servers for custom domains hosted there", () => {
    expect(presetById("one.com")).toMatchObject({
      imapHost: "imap.one.com",
      imapPort: 993,
      smtpHost: "send.one.com",
      smtpPort: 465,
    });
  });
});
