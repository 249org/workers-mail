import { describe, expect, it } from "vitest";
import {
  SEARCH_FILTERS,
  hasSearchToken,
  parseSearch,
  toggleSearchToken,
} from "@/lib/mail/search";

describe("toggleSearchToken", () => {
  it("adds a filter to an empty query", () => {
    expect(toggleSearchToken("", "is:unread")).toBe("is:unread");
  });

  it("appends without disturbing what is already typed", () => {
    expect(toggleSearchToken("from:sam", "is:unread")).toBe("from:sam is:unread");
  });

  it("takes the filter back out when it is already on", () => {
    expect(toggleSearchToken("from:sam is:unread", "is:unread")).toBe("from:sam");
    expect(toggleSearchToken("is:unread", "is:unread")).toBe("");
  });

  it("drops the filters it contradicts", () => {
    // `is:read is:unread` matches nothing, so turning one on turns the other off.
    const filter = SEARCH_FILTERS.find((entry) => entry.id === "unread");
    expect(toggleSearchToken("is:read report", filter!.token, filter!.replaces)).toBe(
      "report is:unread",
    );
  });

  it("matches a token whatever case it was typed in", () => {
    expect(toggleSearchToken("IS:UNREAD", "is:unread")).toBe("");
    expect(hasSearchToken("Is:Unread", "is:unread")).toBe(true);
  });

  it("leaves a quoted phrase alone, quotes and all", () => {
    // `"is:unread"` in quotes is text somebody is searching for, not a filter.
    expect(hasSearchToken('"is:unread"', "is:unread")).toBe(false);
    expect(toggleSearchToken('"launch plan" from:sam', "is:unread")).toBe(
      '"launch plan" from:sam is:unread',
    );
    expect(toggleSearchToken('"is:unread"', "is:unread")).toBe('"is:unread" is:unread');
  });

  it("collapses the whitespace a round trip would otherwise leave", () => {
    expect(toggleSearchToken("from:sam   is:unread   report", "is:unread")).toBe(
      "from:sam report",
    );
  });
});

describe("every offered filter is one the parser understands", () => {
  it.each(SEARCH_FILTERS.map((filter) => [filter.label, filter.token]))(
    "%s narrows the query",
    (_label, token) => {
      const parsed = parseSearch(token);
      expect(parsed.empty).toBe(false);
      // The token must not survive as a bare search term, which would match no subject.
      expect(parsed.terms).toEqual([]);
    },
  );

  it("maps each filter to the field it claims to filter", () => {
    expect(parseSearch("is:unread").seen).toBe(false);
    expect(parseSearch("is:starred").flagged).toBe(true);
    expect(parseSearch("has:attachment").hasAttachment).toBe(true);
    expect(parseSearch("after:7d").after).toBeTypeOf("number");
  });

  it("round-trips through the toggle and still parses", () => {
    let query = "";
    for (const filter of SEARCH_FILTERS) {
      query = toggleSearchToken(query, filter.token, filter.replaces);
    }
    const parsed = parseSearch(query);
    expect(parsed.seen).toBe(false);
    expect(parsed.flagged).toBe(true);
    expect(parsed.hasAttachment).toBe(true);
    expect(parsed.terms).toEqual([]);

    for (const filter of SEARCH_FILTERS) {
      query = toggleSearchToken(query, filter.token, filter.replaces);
    }
    expect(query).toBe("");
  });
});
