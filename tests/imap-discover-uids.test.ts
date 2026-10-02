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

const { discoverUids, contiguousWatermark } = await import("@/lib/transport/imap");

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
    const uids = (await discoverUids(session, {
      lastUid: 200,
      oldestUid: 150,
      backfill: true,
      preferRecent: false,
    })).uids;

    expect(uids.length).toBeGreaterThan(0);
    expect(Math.max(...uids)).toBeLessThan(150);
  });

  it("returns nothing once the oldest message is the first in the mailbox", async () => {
    const session = fakeSession();
    const uids = (await discoverUids(session, {
      lastUid: 200,
      oldestUid: 1,
      backfill: true,
      preferRecent: false,
    })).uids;
    expect(uids).toEqual([]);
  });

  it("seeds from a full scan when the folder has no cursor yet", async () => {
    const session = fakeSession(20);
    const uids = (await discoverUids(session, {
      lastUid: 0,
      oldestUid: 0,
      backfill: true,
      preferRecent: false,
    })).uids;
    expect(uids.length).toBe(20);
  });

  it("keeps making progress as the cursor walks down", async () => {
    // Larger than one backfill span, so a pass cannot swallow the whole mailbox.
    const session = fakeSession(2000);
    const first = (await discoverUids(session, {
      lastUid: 2000,
      oldestUid: 1500,
      backfill: true,
      preferRecent: false,
    })).uids;
    const second = (await discoverUids(session, {
      lastUid: 2000,
      oldestUid: Math.min(...first),
      backfill: true,
      preferRecent: false,
    })).uids;

    // The regression this guards: a second pass used to return the same empty set
    // forever, pinning the inbox to whatever the first pass fetched.
    expect(second.length).toBeGreaterThan(0);
    expect(Math.max(...second)).toBeLessThan(Math.min(...first));
  });
});

describe("discoverUids on an incremental pass", () => {
  it("asks only for mail newer than the cursor", async () => {
    const session = fakeSession();
    const uids = (await discoverUids(session, {
      lastUid: 190,
      oldestUid: 100,
      backfill: false,
      preferRecent: true,
    })).uids;
    expect(uids.every((uid) => uid > 190)).toBe(true);
  });

  it("falls back to a full scan when there is no cursor yet", async () => {
    const session = fakeSession(20);
    const uids = (await discoverUids(session, {
      lastUid: 0,
      oldestUid: 0,
      backfill: false,
      preferRecent: false,
    })).uids;
    expect(uids.length).toBe(20);
  });
});

describe("a wide gap above the cursor", () => {
  it("walks the gap instead of jumping to the newest message", async () => {
    /*
     * The regression this guards cost one inbox roughly five hundred messages. A gap
     * wider than the window used to be answered with recent mail, unread mail and the
     * newest UID; storing the newest moved the cursor to it, and everything in between
     * was below the cursor from then on, where discovery never looks.
     */
    const session = fakeSession(9725);
    const plan = await discoverUids(session, {
      lastUid: 9000,
      oldestUid: 1606,
      backfill: false,
      preferRecent: true,
    });

    expect(plan.uids).not.toContain(9725);
    expect(Math.min(...plan.uids)).toBe(9001);
    // Contiguous: nothing inside the window is left behind.
    expect(plan.uids).toEqual(plan.uids.map((_, i) => 9001 + i));
    expect(plan.scannedTo).toBeLessThan(9725);
  });

  it("catches up over repeated passes", async () => {
    const session = fakeSession(9725);
    let cursor = 9000;
    for (let pass = 0; pass < 20 && cursor < 9725; pass += 1) {
      const plan = await discoverUids(session, {
        lastUid: cursor,
        oldestUid: 1606,
        backfill: false,
        preferRecent: true,
      });
      cursor = Math.max(plan.scannedTo, ...plan.uids);
    }
    expect(cursor).toBe(9725);
  });
});

describe("contiguousWatermark", () => {
  it("crosses a window where everything was fetched", () => {
    const missing = [11, 12, 13];
    expect(contiguousWatermark(10, 20, missing, new Set(missing))).toBe(20);
  });

  it("stops below the oldest UID the batch left for later", () => {
    // A batch of eight out of thirty: the cursor may not step over the other twenty-two.
    const missing = Array.from({ length: 30 }, (_, i) => 101 + i);
    const fetched = new Set(missing.slice(-8));
    expect(contiguousWatermark(100, 130, missing, fetched)).toBe(100);
  });

  it("advances across what was taken from the front", () => {
    const missing = [11, 12, 13, 14, 15];
    expect(contiguousWatermark(10, 15, missing, new Set([11, 12]))).toBe(12);
  });

  it("crosses an empty window, which is every UID in it expunged", () => {
    expect(contiguousWatermark(10, 210, [], new Set())).toBe(210);
  });

  it("never moves backwards", () => {
    // A hole below the cursor is the repair sweep's job; pulling the cursor back to it
    // would refetch the whole mailbox from there.
    expect(contiguousWatermark(500, 400, [], new Set())).toBe(500);
    expect(contiguousWatermark(500, 400, [300], new Set())).toBe(500);
  });
});
