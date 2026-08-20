import { describe, expect, it, vi } from "vitest";

// The module reaches sockets only to open a session; the UID planner itself is pure.
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

const { discoverUids } = await import("@/lib/transport/imap");

/**
 * A mailbox whose UIDs run 1..200. `fetch` answers a UID set the way a server does:
 * only the UIDs that exist inside the requested range.
 */
function fakeSession(highest = 200) {
  const search = vi.fn(async () => Array.from({ length: highest }, (_, i) => i + 1));
  // imapUidSet smuggles the raw set through Array.prototype.join, which is what the
  // real edgeport session serialises, so read it the same way.
  const fetch = vi.fn(async (requested: number[]) => {
    const set = requested.join(",");
    if (set === "*") return [{ uid: highest, flags: [] }];
    const [from, to] = set.split(":");
    const low = Number(from);
    const high = to === "*" ? highest : Number(to);
    const found: Array<{ uid: number; flags: string[] }> = [];
    for (let uid = Math.max(1, low); uid <= Math.min(highest, high); uid += 1) {
      found.push({ uid, flags: [] });
    }
    return found;
  });
  return { search, fetch } as never;
}

describe("discoverUids on backfill", () => {
  it("looks below the oldest message held, not above the newest", async () => {
    const session = fakeSession();
    const uids = await discoverUids(session, {
      lastUid: 200,
      oldestUid: 150,
      backfill: true,
      preferRecent: false,
    });

    expect(uids.length).toBeGreaterThan(0);
    expect(Math.max(...uids)).toBeLessThan(150);
  });

  it("returns nothing once the oldest message is the first in the mailbox", async () => {
    const session = fakeSession();
    const uids = await discoverUids(session, {
      lastUid: 200,
      oldestUid: 1,
      backfill: true,
      preferRecent: false,
    });
    expect(uids).toEqual([]);
  });

  it("seeds from a full scan when the folder has no cursor yet", async () => {
    const session = fakeSession(20);
    const uids = await discoverUids(session, {
      lastUid: 0,
      oldestUid: 0,
      backfill: true,
      preferRecent: false,
    });
    expect(uids.length).toBe(20);
  });

  it("keeps making progress as the cursor walks down", async () => {
    // Larger than one backfill span, so a pass cannot swallow the whole mailbox.
    const session = fakeSession(2000);
    const first = await discoverUids(session, {
      lastUid: 2000,
      oldestUid: 1500,
      backfill: true,
      preferRecent: false,
    });
    const second = await discoverUids(session, {
      lastUid: 2000,
      oldestUid: Math.min(...first),
      backfill: true,
      preferRecent: false,
    });

    // The regression this guards: a second pass used to return the same empty set
    // forever, pinning the inbox to whatever the first pass fetched.
    expect(second.length).toBeGreaterThan(0);
    expect(Math.max(...second)).toBeLessThan(Math.min(...first));
  });
});

describe("discoverUids on an incremental pass", () => {
  it("asks only for mail newer than the cursor", async () => {
    const session = fakeSession();
    const uids = await discoverUids(session, {
      lastUid: 190,
      oldestUid: 100,
      backfill: false,
      preferRecent: true,
    });
    expect(uids.every((uid) => uid > 190)).toBe(true);
  });

  it("falls back to a full scan when there is no cursor yet", async () => {
    const session = fakeSession(20);
    const uids = await discoverUids(session, {
      lastUid: 0,
      oldestUid: 0,
      backfill: false,
      preferRecent: false,
    });
    expect(uids.length).toBe(20);
  });
});
