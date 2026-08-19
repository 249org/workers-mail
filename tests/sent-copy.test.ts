import { describe, expect, it } from "vitest";
import { smtpSavesToSentFolder } from "@/lib/transport/presets";

describe("smtpSavesToSentFolder", () => {
  it("skips the append for providers that file sent mail themselves", () => {
    expect(smtpSavesToSentFolder("smtp.gmail.com")).toBe(true);
    expect(smtpSavesToSentFolder("smtp.office365.com")).toBe(true);
    expect(smtpSavesToSentFolder("smtp-mail.outlook.com")).toBe(true);
  });

  it("appends for hosts that do not, which is the common case", () => {
    expect(smtpSavesToSentFolder("send.one.com")).toBe(false);
    expect(smtpSavesToSentFolder("smtp.fastmail.com")).toBe(false);
    expect(smtpSavesToSentFolder("mail.example.com")).toBe(false);
  });

  it("is case and whitespace insensitive", () => {
    expect(smtpSavesToSentFolder("  SMTP.Gmail.COM ")).toBe(true);
  });

  it("treats a missing host as needing the append", () => {
    expect(smtpSavesToSentFolder(null)).toBe(false);
    expect(smtpSavesToSentFolder(undefined)).toBe(false);
    expect(smtpSavesToSentFolder("")).toBe(false);
  });

  it("does not let a lookalike host suppress the append", () => {
    expect(smtpSavesToSentFolder("smtp.gmail.com.attacker.tld")).toBe(false);
    expect(smtpSavesToSentFolder("notsmtp.gmail.com")).toBe(false);
  });

  it("tolerates a trailing dot from DNS-style input", () => {
    expect(smtpSavesToSentFolder("smtp.gmail.com.")).toBe(true);
  });
});
