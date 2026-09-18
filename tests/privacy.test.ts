import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIVACY,
  DEFAULT_SESSION_TTL_DAYS,
  MAX_SESSION_TTL_DAYS,
  SESSION_TTL_DAYS,
  parsePrivacy,
  parseSessionTtlDays,
} from "@/lib/privacy";
import { describeUserAgent } from "@/lib/auth/user-agent";

describe("privacy prefs", () => {
  it("defaults to asking about remote images and collecting contacts", () => {
    expect(parsePrivacy(null)).toEqual(DEFAULT_PRIVACY);
    expect(parsePrivacy({ remoteImages: "allow", collectContacts: false })).toEqual({
      remoteImages: "allow",
      collectContacts: false,
    });
    expect(parsePrivacy({ remoteImages: "nope" }).remoteImages).toBe("ask");
  });

  it("only accepts 1, 7, or 30 day sessions", () => {
    expect(parseSessionTtlDays(1)).toBe(1);
    expect(parseSessionTtlDays(7)).toBe(7);
    expect(parseSessionTtlDays(30)).toBe(30);
  });

  it("falls back to a single day", () => {
    // A mailbox is worth more than a month of staying signed in.
    for (const value of [12, 0, -1, null, undefined, "7", {}]) {
      expect(parseSessionTtlDays(value)).toBe(1);
    }
    expect(DEFAULT_SESSION_TTL_DAYS).toBe(1);
  });

  it("keeps the session index outliving the longest session it can hold", () => {
    expect(MAX_SESSION_TTL_DAYS).toBe(Math.max(...SESSION_TTL_DAYS));
  });
});

describe("user agent labels", () => {
  it("names common browsers", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome · macOS");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe(
      "Safari · iOS",
    );
  });
});
