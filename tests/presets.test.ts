import { describe, expect, it } from "vitest";
import { hostsForEasyProvider, presetById, presetFor } from "@/lib/transport/presets";

describe("presetFor", () => {
  it("matches consumer domains", () => {
    expect(presetFor("ada@gmail.com")?.imapHost).toBe("imap.gmail.com");
    expect(presetFor("ada@one.com")?.smtpHost).toBe("send.one.com");
  });

  it("does not guess imap.{domain} for custom domains", () => {
    expect(presetFor("hello@mena-speakers.com")).toBeNull();
  });
});

describe("hostsForEasyProvider", () => {
  it("fills Gmail IMAP and SMTP", () => {
    expect(hostsForEasyProvider("gmail")).toEqual({
      imapHost: "imap.gmail.com",
      imapPort: 993,
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
    });
  });

  it("fills Microsoft 365 IMAP and SMTP", () => {
    expect(hostsForEasyProvider("outlook")).toEqual({
      imapHost: "outlook.office365.com",
      imapPort: 993,
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
    });
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
