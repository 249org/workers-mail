import { describe, expect, it } from "vitest";
import {
  TransportConfigError,
  validateImapSettings,
  validateSmtpSettings,
} from "@/lib/transport/validate";

describe("validateSmtpSettings", () => {
  it("refuses port 25, which Workers cannot open", () => {
    expect(() =>
      validateSmtpSettings({ host: "smtp.example.com", port: 25, username: "a@example.com" }),
    ).toThrow(TransportConfigError);
  });

  it("defaults port 587 to STARTTLS and 465 to implicit TLS", () => {
    expect(validateSmtpSettings({ host: "smtp.example.com", username: "a@b.com" }).tls).toBe(
      "starttls",
    );
    expect(
      validateSmtpSettings({ host: "smtp.example.com", port: 465, username: "a@b.com" }).tls,
    ).toBe("implicit");
  });

  it("rejects a TLS mode that contradicts the port", () => {
    expect(() =>
      validateSmtpSettings({
        host: "smtp.example.com",
        port: 465,
        tls: "starttls",
        username: "a@b.com",
      }),
    ).toThrow(/implicit TLS/);
  });
});

describe("validateImapSettings", () => {
  it("defaults to implicit TLS on 993", () => {
    const settings = validateImapSettings({ host: "imap.example.com", username: "a@b.com" });
    expect(settings).toMatchObject({ port: 993, tls: "implicit" });
  });

  it("requires a plausible hostname", () => {
    expect(() => validateImapSettings({ host: "not a host", username: "a@b.com" })).toThrow(
      TransportConfigError,
    );
  });

  it("requires a username", () => {
    expect(() => validateImapSettings({ host: "imap.example.com" })).toThrow(/username/i);
  });
});
