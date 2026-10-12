import { describe, expect, it, vi } from "vitest";

// The module reaches a socket only to open a session; this comparison is pure.
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

const { flagUpdates } = await import("@/lib/transport/imap");

const held = (id: string, uid: number | null, seen: boolean, flagged = false) => ({
  id,
  uid,
  seen,
  flagged,
});

const onServer = (uid: number, ...flags: string[]) => ({ uid, flags });

describe("flagUpdates", () => {
  it("picks up a message read in another client", () => {
    /*
     * The flags were written once, when the message was first stored, and a pass only
     * ever fetches UIDs it does not already hold — so reading mail elsewhere left it
     * bold here for good.
     */
    const changes = flagUpdates(
      [held("m1", 10, false)],
      [onServer(10, "\\Seen")],
    );
    expect(changes).toEqual([{ id: "m1", seen: true, flagged: false }]);
  });

  it("picks up a message marked unread again elsewhere", () => {
    expect(flagUpdates([held("m1", 10, true)], [onServer(10)])).toEqual([
      { id: "m1", seen: false, flagged: false },
    ]);
  });

  it("follows a star set or cleared elsewhere", () => {
    expect(flagUpdates([held("m1", 10, true, false)], [onServer(10, "\\Seen", "\\Flagged")])).toEqual(
      [{ id: "m1", seen: true, flagged: true }],
    );
    expect(flagUpdates([held("m2", 11, true, true)], [onServer(11, "\\Seen")])).toEqual([
      { id: "m2", seen: true, flagged: false },
    ]);
  });

  it("says nothing about messages that already agree", () => {
    const changes = flagUpdates(
      [held("m1", 10, true), held("m2", 11, false), held("m3", 12, true, true)],
      [onServer(10, "\\Seen"), onServer(11), onServer(12, "\\Seen", "\\Flagged")],
    );
    expect(changes).toEqual([]);
  });

  it("leaves a message the server did not answer for alone", () => {
    /*
     * Silence means it moved or was expunged, which is a different question from whether
     * anyone read it. Treating it as unflagged would mark mail read that nobody opened.
     */
    expect(flagUpdates([held("gone", 99, true, true)], [])).toEqual([]);
  });

  it("ignores rows with no server UID at all", () => {
    expect(flagUpdates([held("local", null, false)], [onServer(10, "\\Seen")])).toEqual([]);
  });

  it("is not confused by other flags the server carries", () => {
    const changes = flagUpdates(
      [held("m1", 10, false)],
      [onServer(10, "\\Answered", "\\Seen", "$Forwarded", "NonJunk")],
    );
    expect(changes).toEqual([{ id: "m1", seen: true, flagged: false }]);
  });

  it("reports only what changed, out of a crowd", () => {
    const rows = Array.from({ length: 50 }, (_, i) => held(`m${i}`, 100 + i, false));
    const server = rows.map((row, i) =>
      i === 7 || i === 42 ? onServer(row.uid as number, "\\Seen") : onServer(row.uid as number),
    );
    expect(flagUpdates(rows, server).map((c) => c.id)).toEqual(["m7", "m42"]);
  });
});
