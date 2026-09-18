import { describe, expect, it } from "vitest";
import {
  describeImapError,
  isImapAuthFailure,
  isMissingUidError,
} from "@/lib/transport/imap-error";
import { providerAuthNote, providerAuthNoteForHost } from "@/lib/transport/presets";
import { ApiError, errorResponse, isApiError } from "@/lib/auth/api";

describe("isMissingUidError", () => {
  it("recognises the wordings hosts use when a UID is already gone", () => {
    expect(isMissingUidError(new Error("IMAP NO: No such message"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: The following UIDs do not exist"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: Invalid messageset"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: Message has been deleted"))).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: No messages found"))).toBe(true);
    expect(
      isMissingUidError(new Error("IMAP NO: Error in IMAP command UID MOVE: Invalid messageset")),
    ).toBe(true);
    expect(isMissingUidError(new Error("IMAP NO: No such UID"))).toBe(true);
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

  it("unwraps an ApiError on cause so a wrapped throw still returns the real status", async () => {
    const wrapped = new Error("handler");
    wrapped.cause = new ApiError(502, "The mail server rejected that change (Invalid messageset).");
    const response = errorResponse(wrapped);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The mail server rejected that change (Invalid messageset).",
    });
  });

  it("turns a bare IMAP rejection into 502 instead of an opaque ref", async () => {
    const response = errorResponse(new Error("IMAP NO: Error in IMAP command UID MOVE: Invalid messageset"));
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Invalid messageset");
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

  it("says a Microsoft account cannot be reconnected, rather than suggesting a way", () => {
    /*
     * Microsoft retired app passwords along with basic auth, and this app no longer
     * offers Microsoft sign-in — so there is no route left. Naming one would be a lie.
     */
    const text = describeImapError(new Error("imap login rejected"), "outlook.office365.com");
    expect(text).toContain("Microsoft");
    expect(text).toContain("cannot be reconnected");
    /*
     * Saying app passwords are gone is the explanation; telling someone to make one, or
     * linking somewhere to do it, is the dead end. Nor may it offer sign-in as a way back
     * now that there is none — "rejected the sign-in" only names what failed.
     */
    expect(text).not.toMatch(/create an app password|https?:\/\//i);
    expect(text).not.toMatch(/one-click|reconnect this mailbox with/i);
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

  it("marks Microsoft accounts as out of reach", () => {
    for (const address of ["a@outlook.com", "a@hotmail.com", "a@live.com"]) {
      expect(providerAuthNote(address)).toMatchObject({
        kind: "unsupported",
        label: "Microsoft",
      });
    }
  });

  it("never points anywhere this app cannot actually go", () => {
    // With Microsoft sign-in removed, no note may still advertise it.
    for (const note of ["a@outlook.com", "a@gmail.com", "a@icloud.com"].map(providerAuthNote)) {
      expect(note?.kind).not.toBe("oauth-only");
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
    expect(providerAuthNoteForHost("outlook.office365.com")?.kind).toBe("unsupported");
    expect(providerAuthNoteForHost("imap.one.com")).toBeNull();
    expect(providerAuthNoteForHost(null)).toBeNull();
  });

  it("says nothing about a custom domain until its host is known", () => {
    expect(providerAuthNote("noreply@sharjahtourism.ae")).toBeNull();
    expect(providerAuthNoteForHost("outlook.office365.com")).toMatchObject({
      kind: "unsupported",
      label: "Microsoft",
    });
  });
});
