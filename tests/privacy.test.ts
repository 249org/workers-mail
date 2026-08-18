import { describe, expect, it } from "vitest";
import { DEFAULT_PRIVACY, parsePrivacy, parseSessionTtlDays } from "@/lib/privacy";
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
    expect(parseSessionTtlDays(7)).toBe(7);
    expect(parseSessionTtlDays(12)).toBe(30);
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
