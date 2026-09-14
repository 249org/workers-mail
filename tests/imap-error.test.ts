import { describe, expect, it } from "vitest";
import {
  describeImapError,
  isImapAuthFailure,
  isMissingUidError,
} from "@/lib/transport/imap-error";
import { providerAuthNote, providerAuthNoteForHost } from "@/lib/transport/presets";
import { ApiError, isApiError } from "@/lib/auth/api";

describe("isMissingUidError", () => {
  it("recognises the wordings hosts use when a UID is already gone", () => {
    expect(isMissingUidError(new Error("IMAP NO: No such message"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: The following UIDs do not exist"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: Invalid messageset"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: Message has been deleted"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: No messages found"))).toBe(true);
  });

  it("does not treat a missing mailbox or ordinary rejection as a missing UID", () => {
    // Bare NONEXISTENT is also used when the destination folder is unknown.
    expect(isMissingUidError(new Error("IMAP NO: [NONEXISTENT] Mailbox does not exist"))).toBe(
      false,
    );
    expect(isMissingUidError(new Error("IMAP NO: [OVERQUOTA] Too many messages"))).toBe(false);
    expect(isMissingUidError(new Error("IMAP NO: Permission denied"))).toBe(false);
  });
});

describe("isApiError", () => {
  it("recognises a real ApiError and a same-shaped object from another module copy", () => {
    expect(isApiError(new ApiError(502, "nope"))).toBe(true);
    expect(
      isApiError({ name: "ApiError", status: 502, message: "The mail server could not apply that change." }),
    ).toBe(true);
    expect(isApiError(new Error("nope"))).toBe(false);
    expect(isApiError({ name: "Error", status: 502, message: "x" })).toBe(false);
  });
});

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
    // A custom domain on Microsoft 365 or Google Workspace names neither in the
    // address, so the host discovery resolved is the only thing that identifies it.
    expect(providerAuthNoteForHost("imap.gmail.com")?.kind).toBe("app-password");
    expect(providerAuthNoteForHost("outlook.office365.com")?.kind).toBe("oauth-only");
    expect(providerAuthNoteForHost("imap.one.com")).toBeNull();
    expect(providerAuthNoteForHost(null)).toBeNull();
  });

  it("says nothing about a custom domain until its host is known", () => {
    expect(providerAuthNote("noreply@sharjahtourism.ae")).toBeNull();
    expect(providerAuthNoteForHost("outlook.office365.com")).toMatchObject({
      kind: "oauth-only",
      provider: "microsoft",
    });
  });
});
