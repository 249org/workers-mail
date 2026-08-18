import { describe, expect, it } from "vitest";
import { parseDate, parseSearch } from "@/lib/mail/search";

describe("parseSearch", () => {
  it("treats plain words as free-text terms", () => {
    expect(parseSearch("launch plan")).toMatchObject({
      terms: ["launch", "plan"],
      empty: false,
    });
  });

  it("reports an empty query for blank input", () => {
    expect(parseSearch("   ").empty).toBe(true);
    expect(parseSearch("").empty).toBe(true);
  });

  it("extracts sender, recipient and subject operators", () => {
    expect(parseSearch("from:sam@example.com to:team subject:launch")).toMatchObject({
      from: "sam@example.com",
      to: "team",
      subject: "launch",
      terms: [],
    });
  });

  it("keeps quoted phrases as one term", () => {
    expect(parseSearch('"quarterly review" urgent').terms).toEqual([
      "quarterly review",
      "urgent",
    ]);
  });

  it("allows a quoted value on an operator", () => {
    expect(parseSearch('subject:"launch plan"').subject).toBe("launch plan");
  });

  it("does not treat a quoted colon string as an operator", () => {
    const parsed = parseSearch('"from:sam"');
    expect(parsed.from).toBeUndefined();
    expect(parsed.terms).toEqual(["from:sam"]);
  });

  it("maps is: and has: onto flags", () => {
    expect(parseSearch("is:unread")).toMatchObject({ seen: false });
    expect(parseSearch("is:read")).toMatchObject({ seen: true });
    expect(parseSearch("is:starred")).toMatchObject({ flagged: true });
    expect(parseSearch("has:attachment")).toMatchObject({ hasAttachment: true });
  });

  it("falls back to free text for unknown operators and values", () => {
    expect(parseSearch("is:banana").terms).toEqual(["is:banana"]);
    expect(parseSearch("label:work").terms).toEqual(["label:work"]);
  });

  it("lowercases operator values but preserves phrase terms", () => {
    expect(parseSearch("from:Sam@Example.COM Launch")).toMatchObject({
      from: "sam@example.com",
      terms: ["Launch"],
    });
  });

  it("combines operators with free text", () => {
    expect(parseSearch("from:sam is:unread invoice")).toMatchObject({
      from: "sam",
      seen: false,
      terms: ["invoice"],
    });
  });

  it("ignores an operator with no value", () => {
    expect(parseSearch("from:").terms).toEqual(["from:"]);
  });

  it("reads in: as a folder name", () => {
    expect(parseSearch("in:Archive").folder).toBe("archive");
  });
});

describe("parseDate", () => {
  const now = Date.parse("2024-06-15T12:00:00Z");

  it("reads relative spans", () => {
    expect(parseDate("7d", now)).toBe(Math.floor((now - 7 * 86_400_000) / 1000));
    expect(parseDate("2w", now)).toBe(Math.floor((now - 14 * 86_400_000) / 1000));
    expect(parseDate("1y", now)).toBe(Math.floor((now - 365 * 86_400_000) / 1000));
  });

  it("reads absolute dates in both separators", () => {
    expect(parseDate("2024-03-01", now)).toBe(Date.parse("2024-03-01") / 1000);
    expect(parseDate("2024/03/01", now)).toBe(Date.parse("2024-03-01") / 1000);
  });

  it("returns null for values that are not dates", () => {
    expect(parseDate("banana", now)).toBeNull();
    expect(parseDate("", now)).toBeNull();
  });
});

describe("date operators", () => {
  it("puts before/after onto the query", () => {
    const parsed = parseSearch("after:2024-01-01 before:2024-06-01");
    expect(parsed.after).toBe(Date.parse("2024-01-01") / 1000);
    expect(parsed.before).toBe(Date.parse("2024-06-01") / 1000);
  });

  it("keeps an unparseable date as free text rather than dropping it", () => {
    expect(parseSearch("before:someday").terms).toEqual(["before:someday"]);
  });
});
