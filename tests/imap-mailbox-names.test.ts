import { describe, expect, it } from "vitest";
import { imapQuote } from "@/lib/transport/imap-uid-set";
import {
  decodeMailboxName,
  encodeMailboxName,
  imapMailboxArg,
} from "@/lib/transport/imap-mailbox-names";

describe("encodeMailboxName", () => {
  it("leaves plain ASCII untouched", () => {
    expect(encodeMailboxName("Receipts")).toBe("Receipts");
    expect(encodeMailboxName("Work/2024")).toBe("Work/2024");
  });

  it("escapes a literal ampersand as &-", () => {
    expect(encodeMailboxName("R&D")).toBe("R&-D");
  });

  it("encodes the examples given in RFC 3501", () => {
    expect(encodeMailboxName("~peter/mail/台北/日本語")).toBe(
      "~peter/mail/&U,BTFw-/&ZeVnLIqe-",
    );
  });

  it("encodes accented Latin text", () => {
    expect(encodeMailboxName("Café")).toBe("Caf&AOk-");
  });

  it("handles characters outside the basic plane", () => {
    // A surrogate pair must encode as two UTF-16 units, not one code point.
    expect(decodeMailboxName(encodeMailboxName("Pin 📌"))).toBe("Pin 📌");
  });
});

describe("decodeMailboxName", () => {
  it("reverses the RFC 3501 example", () => {
    expect(decodeMailboxName("~peter/mail/&U,BTFw-/&ZeVnLIqe-")).toBe(
      "~peter/mail/台北/日本語",
    );
  });

  it("restores an escaped ampersand", () => {
    expect(decodeMailboxName("R&-D")).toBe("R&D");
  });

  it("round trips a mix of scripts", () => {
    for (const name of ["Inbox", "Café", "Ünïcødé", "日本語", "R&D", "a/b/c"]) {
      expect(decodeMailboxName(encodeMailboxName(name))).toBe(name);
    }
  });
});

describe("quoting", () => {
  it("wraps and escapes quotes and backslashes", () => {
    expect(imapQuote('say "hi"')).toBe('"say \\"hi\\""');
    expect(imapQuote("back\\slash")).toBe('"back\\\\slash"');
  });

  it("encodes mailbox names but leaves credentials alone", () => {
    expect(imapMailboxArg("Café")).toBe('"Caf&AOk-"');
    // Passwords must not be UTF-7 encoded or the server sees a different secret.
    expect(imapQuote("Café")).toBe('"Café"');
  });
});
