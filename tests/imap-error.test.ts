import { describe, expect, it } from "vitest";
import { describeImapError, isImapAuthFailure } from "@/lib/transport/imap-error";
import { appPasswordHelp, appPasswordHelpForHost } from "@/lib/transport/presets";

describe("isImapAuthFailure", () => {
  it("recognises the wordings servers and edgeport use", () => {
    expect(isImapAuthFailure(new Error("imap login rejected"))).toBe(true);
    expect(isImapAuthFailure(new Error("[AUTHENTICATIONFAILED] Invalid credentials"))).toBe(true);
    expect(isImapAuthFailure(new Error("authentication failed"))).toBe(true);
  });

  it("does not claim a timeout or a socket error is an auth failure", () => {
    expect(isImapAuthFailure(new Error("Timed out after 20000ms"))).toBe(false);
    expect(isImapAuthFailure(new Error("connection refused"))).toBe(false);
  });
});

describe("describeImapError", () => {
  it("names the app password and links it for Gmail", () => {
    const text = describeImapError(new Error("imap login rejected"), "imap.gmail.com");
    expect(text).toContain("Gmail");
    expect(text).toContain("app password");
    expect(text).toContain("https://myaccount.google.com/apppasswords");
  });

  it("does the same for Microsoft", () => {
    const text = describeImapError(new Error("imap login rejected"), "outlook.office365.com");
    expect(text).toContain("Microsoft");
    expect(text).toContain("app password");
  });

  it("stays generic for a host with no known policy", () => {
    const text = describeImapError(new Error("imap login rejected"), "imap.one.com");
    expect(text).toContain("rejected the sign-in");
    expect(text).not.toContain("https://");
  });

  it("keeps the timeout wording", () => {
    expect(describeImapError(new Error("Timed out after 20000ms"), "imap.gmail.com")).toContain(
      "took too long",
    );
  });

  it("passes an unrecognised error through untouched", () => {
    expect(describeImapError(new Error("BYE server shutting down"), null)).toBe(
      "BYE server shutting down",
    );
  });
});

describe("appPasswordHelp", () => {
  it("flags providers that refuse ordinary passwords over IMAP", () => {
    expect(appPasswordHelp("someone@gmail.com")?.label).toBe("Gmail");
    expect(appPasswordHelp("someone@outlook.com")?.label).toBe("Microsoft");
    expect(appPasswordHelp("someone@icloud.com")?.label).toBe("iCloud");
  });

  it("stays quiet for hosts that accept the account password", () => {
    expect(appPasswordHelp("support@mena-speakers.com")).toBeNull();
    expect(appPasswordHelp("not-an-address")).toBeNull();
  });

  it("resolves the same help from an IMAP host", () => {
    expect(appPasswordHelpForHost("imap.gmail.com")?.label).toBe("Gmail");
    expect(appPasswordHelpForHost("imap.one.com")).toBeNull();
    expect(appPasswordHelpForHost(null)).toBeNull();
  });
});
