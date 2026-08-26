import { describe, expect, it } from "vitest";
import { describeImapError, isImapAuthFailure } from "@/lib/transport/imap-error";
import { providerAuthNote, providerAuthNoteForHost } from "@/lib/transport/presets";

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

  it("sends Microsoft to one-click sign-in, since no password can work", () => {
    const text = describeImapError(new Error("imap login rejected"), "outlook.office365.com");
    expect(text).toContain("Microsoft");
    expect(text).toContain("one-click");
    // Microsoft retired app passwords with basic auth; suggesting one is a dead end.
    expect(text).not.toContain("app password");
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

describe("providerAuthNote", () => {
  it("offers an app password where one still works", () => {
    expect(providerAuthNote("someone@gmail.com")).toMatchObject({
      kind: "app-password",
      label: "Gmail",
    });
    expect(providerAuthNote("someone@icloud.com")?.kind).toBe("app-password");
  });

  it("marks Microsoft accounts as sign-in only", () => {
    for (const address of ["a@outlook.com", "a@hotmail.com", "a@live.com"]) {
      expect(providerAuthNote(address)).toMatchObject({
        kind: "oauth-only",
        provider: "microsoft",
      });
    }
  });

  it("stays quiet for hosts that accept the account password", () => {
    expect(providerAuthNote("support@mena-speakers.com")).toBeNull();
    expect(providerAuthNote("not-an-address")).toBeNull();
  });

  it("resolves the same note from an IMAP host", () => {
    expect(providerAuthNoteForHost("imap.gmail.com")?.kind).toBe("app-password");
    expect(providerAuthNoteForHost("outlook.office365.com")?.kind).toBe("oauth-only");
    expect(providerAuthNoteForHost("imap.one.com")).toBeNull();
    expect(providerAuthNoteForHost(null)).toBeNull();
  });
});
