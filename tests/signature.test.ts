import { describe, expect, it } from "vitest";
import {
  applySignature,
  DEFAULT_SIGNATURE,
  parseSignature,
  shouldIncludeSignature,
  signatureText,
  mailboxSignatureMode,
} from "@/lib/signature";

describe("parseSignature", () => {
  it("defaults to on for new mail only", () => {
    expect(parseSignature(null)).toEqual({ ...DEFAULT_SIGNATURE, byMailbox: {} });
    expect(parseSignature({ enabled: false, includeOnReplies: true }).enabled).toBe(false);
    expect(parseSignature({ includeOnReplies: true }).includeOnReplies).toBe(true);
    expect(parseSignature({ includeOnForwards: true }).includeOnForwards).toBe(true);
  });

  it("caps and sanitises the text", () => {
    expect(parseSignature({ text: "Best,\r\nAyman" }).text).toBe("Best,\nAyman");
    expect(parseSignature({ text: "x".repeat(5000) }).text.length).toBe(4000);
    // A blank entry is kept, normalised to "": the mailbox was given an explicit
    // choice of no signature, which differs from having no entry at all.
    expect(parseSignature({ byMailbox: { "mb-1": "  " } }).byMailbox).toEqual({ "mb-1": "" });
    expect(parseSignature({ byMailbox: { "mb-1": "Ops" } }).byMailbox).toEqual({ "mb-1": "Ops" });
  });
});

describe("signatureText", () => {
  it("prefers a mailbox override and respects the master switch", () => {
    const prefs = parseSignature({
      text: "Default",
      byMailbox: { work: "Work" },
    });
    expect(signatureText(prefs, "work")).toBe("Work");
    expect(signatureText(prefs, "home")).toBe("Default");
    expect(signatureText({ ...prefs, enabled: false }, "work")).toBe("");
  });
});

describe("shouldIncludeSignature", () => {
  it("maps compose modes onto the include flags", () => {
    const prefs = parseSignature({
      includeOnNew: true,
      includeOnReplies: false,
      includeOnForwards: true,
    });
    expect(shouldIncludeSignature(prefs, "compose")).toBe(true);
    expect(shouldIncludeSignature(prefs, undefined)).toBe(true);
    expect(shouldIncludeSignature(prefs, "reply")).toBe(false);
    expect(shouldIncludeSignature(prefs, "replyAll")).toBe(false);
    expect(shouldIncludeSignature(prefs, "forward")).toBe(true);
    expect(shouldIncludeSignature({ ...prefs, enabled: false }, "compose")).toBe(false);
  });
});

describe("applySignature", () => {
  it("appends a RFC 3676 delimiter and replaces an existing sign-off", () => {
    expect(applySignature("", "Best,\nAyman")).toBe("-- \nBest,\nAyman");
    expect(applySignature("Hello", "Ayman")).toBe("Hello\n\n-- \nAyman");
    expect(applySignature("Hello\n\n-- \nOld", "New")).toBe("Hello\n\n-- \nNew");
    expect(applySignature("Hello\n\n-- \nOld", "")).toBe("Hello");
  });

  it("sits above a quoted reply", () => {
    const quoted = "\n\nOn Tue, Jane wrote:\n> hi";
    expect(applySignature(quoted, "Ayman")).toBe("-- \nAyman\n\nOn Tue, Jane wrote:\n> hi");
    expect(applySignature(`Thanks${quoted}`, "Ayman")).toBe(
      "Thanks\n\n-- \nAyman\n\nOn Tue, Jane wrote:\n> hi",
    );
    expect(applySignature(`Thanks\n\n-- \nOld${quoted}`, "New")).toBe(
      "Thanks\n\n-- \nNew\n\nOn Tue, Jane wrote:\n> hi",
    );
  });
});

describe("per-mailbox signatures", () => {
  const prefs = parseSignature({
    enabled: true,
    text: "Regards,\nAyman\nMENA Speakers",
    byMailbox: { mbx_gmail: "Ayman", mbx_quiet: "" },
  });

  it("uses a mailbox's own wording", () => {
    expect(signatureText(prefs, "mbx_gmail")).toBe("Ayman");
  });

  it("falls back to the default for a mailbox with no entry", () => {
    expect(signatureText(prefs, "mbx_other")).toContain("MENA Speakers");
  });

  it("sends nothing for a mailbox set to none", () => {
    // The regression: an empty entry used to be dropped, so a signature written for
    // one identity leaked onto mail sent from an unrelated account.
    expect(signatureText(prefs, "mbx_quiet")).toBe("");
  });

  it("reports the mode each mailbox is in", () => {
    expect(mailboxSignatureMode(prefs, "mbx_gmail")).toBe("custom");
    expect(mailboxSignatureMode(prefs, "mbx_quiet")).toBe("none");
    expect(mailboxSignatureMode(prefs, "mbx_other")).toBe("default");
  });

  it("survives a round trip through storage", () => {
    const again = parseSignature(JSON.parse(JSON.stringify(prefs)));
    expect(signatureText(again, "mbx_quiet")).toBe("");
    expect(mailboxSignatureMode(again, "mbx_quiet")).toBe("none");
  });

  it("swaps the block when the From mailbox changes mid-compose", () => {
    const body = applySignature("Hi there", signatureText(prefs, "mbx_other"));
    const swapped = applySignature(body, signatureText(prefs, "mbx_gmail"));
    expect(swapped).not.toContain("MENA Speakers");
    expect(swapped).toContain("Ayman");
  });

  it("strips the block entirely when switching to a none mailbox", () => {
    const body = applySignature("Hi there", signatureText(prefs, "mbx_other"));
    const cleared = applySignature(body, signatureText(prefs, "mbx_quiet"));
    expect(cleared).not.toContain("MENA Speakers");
    expect(cleared.trim()).toBe("Hi there");
  });
});
