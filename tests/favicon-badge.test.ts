import { describe, expect, it } from "vitest";
import { badgeBox, labelWidth, withExplicitSize, ICON_PX } from "@/lib/mail/favicon";
import { badgeLabel, inboxUnread } from "@/lib/mail/unread";

const folder = (role: string, unread: number) => ({ role, unread });

describe("what the badge counts", () => {
  it("reads the inbox, the same number the sidebar shows", () => {
    expect(inboxUnread([folder("inbox", 3), folder("archive", 2)])).toBe(3);
  });

  it("ignores the labels Gmail serves as folders", () => {
    /*
     * All Mail and Important hold the same messages the inbox does. Totalling the folders
     * counted one account's ninety unread three times over and put 99+ on the tab of a
     * mailbox with nothing waiting in it at all.
     */
    expect(
      inboxUnread([
        folder("inbox", 87),
        folder("archive", 86),
        folder("custom", 22),
      ]),
    ).toBe(87);
  });

  it("ignores the folders whose sidebar number is a size, not a count", () => {
    // A trash holding a hundred read messages is not a hundred messages to read.
    expect(
      inboxUnread([
        folder("inbox", 0),
        folder("trash", 119),
        folder("drafts", 4),
        folder("junk", 37),
        folder("sent", 9),
      ]),
    ).toBe(0);
  });

  it("says nothing when there is no inbox yet", () => {
    expect(inboxUnread([])).toBe(0);
    expect(inboxUnread([folder("custom", 5)])).toBe(0);
  });

  it("ignores a negative, which no count should ever be", () => {
    expect(inboxUnread([folder("inbox", -4)])).toBe(0);
  });
});

describe("badgeLabel", () => {
  it("says nothing when there is nothing waiting", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(-1)).toBe("");
    expect(badgeLabel(Number.NaN)).toBe("");
  });

  it("writes the count out while it still fits", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(42)).toBe("42");
    expect(badgeLabel(99)).toBe("99");
  });

  it("stops counting past ninety-nine", () => {
    expect(badgeLabel(100)).toBe("99+");
    expect(badgeLabel(4_312)).toBe("99+");
  });
});

describe("badgeBox", () => {
  it("keeps a single digit round", () => {
    const box = badgeBox("7");
    expect(box.width).toBe(box.height);
  });

  it("never lets the number spill out of its pill", () => {
    /*
     * The pill is sized from the label, and the label shrinks only once, for the three
     * characters of `99+`. Getting either wrong clips a digit, which reads as a different
     * number rather than as a mistake.
     */
    for (const label of ["1", "9", "12", "48", "99", "99+"]) {
      const box = badgeBox(label);
      expect(labelWidth(label, box.fontPx)).toBeLessThanOrEqual(box.width - 4);
    }
  });

  it("grows wider for a second digit rather than shrinking the type", () => {
    // Sixteen pixels is all a tab gives; type that shrinks to fit stops being readable.
    const one = badgeBox("7");
    const two = badgeBox("48");
    expect(two.width).toBeGreaterThan(one.width);
    expect(two.fontPx).toBe(one.fontPx);
  });

  it("stays inside the icon", () => {
    for (const label of ["1", "88", "99+"]) {
      const box = badgeBox(label);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(ICON_PX);
      expect(box.y + box.height).toBeLessThanOrEqual(ICON_PX);
    }
  });

  it("sits in the top-right corner, where a badge is looked for", () => {
    const box = badgeBox("3");
    expect(box.x + box.width / 2).toBeGreaterThan(ICON_PX / 2);
    expect(box.y + box.height / 2).toBeLessThan(ICON_PX / 2);
  });

  it("is big enough to be read at the size a tab gives it", () => {
    // Drawn smaller than this, a digit scaled down to sixteen pixels is a smudge.
    const box = badgeBox("3");
    expect(box.height / ICON_PX).toBeGreaterThan(0.6);
  });

  it("scales with the canvas it is drawn on", () => {
    const small = badgeBox("3", 32);
    const large = badgeBox("3", 128);
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.x + large.width).toBeLessThanOrEqual(128);
  });
});

describe("withExplicitSize", () => {
  it("gives a viewBox-only mark the size a canvas needs", () => {
    /*
     * The app's icon carries a viewBox and nothing else. Drawn from that, the browser has
     * no intrinsic size to work from and puts nothing on the canvas at all.
     */
    const out = withExplicitSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 45">', 64);
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 45" width="64" height="64">',
    );
  });

  it("replaces a size that was already there rather than repeating it", () => {
    const out = withExplicitSize('<svg width="46" height="45" viewBox="0 0 46 45"></svg>', 64);
    expect(out.match(/width=/g)).toHaveLength(1);
    expect(out).toContain('width="64"');
    expect(out).toContain('height="64"');
  });

  it("leaves the body of the drawing alone", () => {
    const svg = '<svg viewBox="0 0 46 45"><rect width="10" height="10"/><style>.a{}</style></svg>';
    const out = withExplicitSize(svg, 64);
    expect(out).toContain('<rect width="10" height="10"/>');
    expect(out).toContain("<style>.a{}</style>");
  });

  it("closes a self-closing root properly", () => {
    expect(withExplicitSize('<svg viewBox="0 0 1 1"/>', 64)).toBe(
      '<svg viewBox="0 0 1 1" width="64" height="64">',
    );
  });

  it("hands back anything that is not an svg untouched", () => {
    expect(withExplicitSize("<html>nope</html>", 64)).toBe("<html>nope</html>");
    expect(withExplicitSize("", 64)).toBe("");
  });
});
