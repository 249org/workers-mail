import { describe, expect, it } from "vitest";
import { describeImapError, isImapTimeout } from "@/lib/transport/imap-error";

describe("imap timeout copy", () => {
  it("recognises edgeport's readUntil stall", () => {
    expect(isImapTimeout("Inbox: readUntil timed out after 15000ms")).toBe(true);
    expect(isImapTimeout("connect timeout")).toBe(true);
    expect(isImapTimeout("NO [UNAVAILABLE] try later")).toBe(false);
  });

  it("does not show the raw millisecond string in the sidebar", () => {
    expect(describeImapError(new Error("readUntil timed out after 15000ms"))).toBe(
      "The mail server took too long to respond. Sync will try again.",
    );
    expect(describeImapError("Inbox is locked")).toBe("Inbox is locked");
  });
});
