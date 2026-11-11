import { describe, expect, it } from "vitest";
import { badgeBox, withExplicitSize, ICON_PX } from "@/lib/mail/favicon";
import { badgeLabel, countsTowardsBadge, unreadBadgeTotal } from "@/lib/mail/unread";

const folder = (role: string, unread: number) => ({ role, unread });

describe("what the badge counts", () => {
  it("adds up the folders where unread means unread", () => {
    expect(
      unreadBadgeTotal([folder("inbox", 3), folder("archive", 2), folder("custom", 1)]),
    ).toBe(6);
  });

  it("leaves out the folders whose number is a size, not a count", () => {
    /*
     * The sidebar shows trash, drafts and junk as how much is sitting in them — fourteen
     * in the trash reads as 14 there. Adding that to the tab would announce mail nobody
     * is waiting on.
     */
    expect(
      unreadBadgeTotal([
        folder("inbox", 2),
        folder("trash", 119),
        folder("drafts", 4),
        folder("junk", 37),
        folder("sent", 9),
      ]),
    ).toBe(2);
  });

  it("names the quiet roles the same way everywhere", () => {
    expect(countsTowardsBadge("inbox")).toBe(true);
    expect(countsTowardsBadge("archive")).toBe(true);
    expect(countsTowardsBadge("custom")).toBe(true);
    for (const role of ["trash", "drafts", "junk", "sent"]) {
      expect(countsTowardsBadge(role)).toBe(false);
    }
  });

  it("ignores a negative, which no count should ever be", () => {
    expect(unreadBadgeTotal([folder("inbox", -4), folder("archive", 1)])).toBe(1);
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

  it("widens for a longer label instead of shrinking the digits", () => {
    // Sixteen pixels is all a tab gives; type that shrinks to fit stops being readable.
    const one = badgeBox("7");
    const two = badgeBox("42");
    const many = badgeBox("99+");
    expect(two.width).toBeGreaterThan(one.width);
    expect(many.width).toBeGreaterThan(two.width);
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
