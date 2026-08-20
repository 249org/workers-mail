import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/transport/oauth-connect", () => ({
  openImap: async () => {
    throw new Error("not used");
  },
  openSmtp: async () => {
    throw new Error("not used");
  },
  connectImapSocket: async () => {
    throw new Error("not used");
  },
}));

const { isMissingMailbox } = await import("@/lib/transport/imap");

/** Mirrors the derivation in trackFolders. */
function leafOf(path: string): string {
  return path.split("/").pop() || path;
}

describe("folder display names", () => {
  it("keeps a dot that belongs to the folder's own name", () => {
    // The reported bug: "Unroll.me" was shown as "me".
    expect(leafOf("Unroll.me")).toBe("Unroll.me");
    expect(leafOf("news.example.com")).toBe("news.example.com");
  });

  it("takes the last segment of a nested path", () => {
    expect(leafOf("Unroll.me/Unsubscribed")).toBe("Unsubscribed");
    expect(leafOf("[Gmail]/All Mail")).toBe("All Mail");
    expect(leafOf("Work/2024/Reports")).toBe("Reports");
  });

  it("leaves a flat name alone", () => {
    expect(leafOf("INBOX")).toBe("INBOX");
    expect(leafOf("Starred")).toBe("Starred");
  });
});

describe("isMissingMailbox", () => {
  it("recognises a server saying the mailbox is gone", () => {
    expect(
      isMissingMailbox(
        new Error("imap NO: [NONEXISTENT] Unknown Mailbox: Unroll.me (now in authenticated state)"),
      ),
    ).toBe(true);
    expect(isMissingMailbox(new Error("NO No such mailbox"))).toBe(true);
  });

  it("does not swallow an unrelated failure", () => {
    expect(isMissingMailbox(new Error("Timed out after 20000ms"))).toBe(false);
    expect(isMissingMailbox(new Error("imap login rejected"))).toBe(false);
    expect(isMissingMailbox(new Error("connection reset"))).toBe(false);
  });
});
