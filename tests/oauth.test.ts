import { describe, expect, it } from "vitest";
import { encodeXoauth2, rewriteImapLogin, rewriteSmtpAuth } from "@/lib/oauth/xoauth2";
import { profileFromIdToken, safeReturnTo } from "@/lib/oauth/providers";

describe("encodeXoauth2", () => {
  it("builds the SASL initial response", () => {
    const encoded = encodeXoauth2("ada@gmail.com", "ya29.token");
    const raw = atob(encoded);
    expect(raw).toBe("user=ada@gmail.com\x01auth=Bearer ya29.token\x01\x01");
  });
});

describe("auth line rewrite", () => {
  it("turns IMAP LOGIN into AUTHENTICATE XOAUTH2", () => {
    expect(rewriteImapLogin('a001 LOGIN "ada@gmail.com" "xoauth2"', "SASL")).toBe(
      "a001 AUTHENTICATE XOAUTH2 SASL",
    );
  });

  it("turns SMTP AUTH PLAIN into AUTH XOAUTH2", () => {
    expect(rewriteSmtpAuth("AUTH PLAIN abc", "SASL")).toBe("AUTH XOAUTH2 SASL");
  });

  it("leaves other SMTP commands alone", () => {
    expect(rewriteSmtpAuth("EHLO edgeport", "SASL")).toBe("EHLO edgeport");
  });
});

describe("profileFromIdToken", () => {
  it("reads email from a JWT payload", () => {
    const payload = btoa(JSON.stringify({ email: "Ada@Gmail.com", name: "Ada" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(profileFromIdToken(`hdr.${payload}.sig`)).toEqual({
      email: "ada@gmail.com",
      name: "Ada",
    });
  });
});

describe("safeReturnTo", () => {
  it("rejects open redirects", () => {
    expect(safeReturnTo("https://evil.example")).toBe("/mail");
    expect(safeReturnTo("//evil.example")).toBe("/mail");
    expect(safeReturnTo("/settings/mailboxes")).toBe("/settings/mailboxes");
  });
});
