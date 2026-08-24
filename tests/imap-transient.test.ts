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

const { isTransientConnectionError } = await import("@/lib/transport/imap-push");

describe("isTransientConnectionError", () => {
  it("retries the refusals a busy host gives during a run of deletes", () => {
    for (const message of [
      "Too many simultaneous connections",
      "NO [UNAVAILABLE] Temporary server problem, try again later",
      "Timed out after 20000ms",
      "connection reset by peer",
      "socket closed",
      "rate limited",
    ]) {
      expect(isTransientConnectionError(new Error(message))).toBe(true);
    }
  });

  it("never retries a credential rejection", () => {
    // Retrying these would double the failed-login count against the account.
    expect(isTransientConnectionError(new Error("imap login rejected"))).toBe(false);
    expect(
      isTransientConnectionError(new Error("[AUTHENTICATIONFAILED] Invalid credentials")),
    ).toBe(false);
  });

  it("leaves an unrecognised protocol error alone", () => {
    expect(isTransientConnectionError(new Error("BAD Missing sequence set"))).toBe(false);
    expect(isTransientConnectionError(new Error("NONEXISTENT Unknown Mailbox"))).toBe(false);
  });
});
