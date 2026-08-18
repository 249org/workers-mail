import { describe, expect, it } from "vitest";
import {
  applySignature,
  DEFAULT_SIGNATURE,
  parseSignature,
  shouldIncludeSignature,
  signatureText,
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
    expect(parseSignature({ byMailbox: { "mb-1": "  " } }).byMailbox).toEqual({});
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
