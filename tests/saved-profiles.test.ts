import { describe, expect, it } from "vitest";
import { parseSavedProfiles } from "@/lib/auth/saved-profiles";

describe("saved login profiles", () => {
  it("keeps valid emails, newest first, and drops junk", () => {
    expect(
      parseSavedProfiles([
        { email: "old@example.com", usedAt: 1 },
        { email: "NEW@example.com", usedAt: 9 },
        { email: "not-an-email", usedAt: 12 },
        { email: "new@example.com", usedAt: 3 },
        { email: 12, usedAt: 4 },
      ]),
    ).toEqual([
      { email: "new@example.com", usedAt: 9 },
      { email: "old@example.com", usedAt: 1 },
    ]);
  });

  it("caps the list and ignores a non-array", () => {
    expect(parseSavedProfiles(null)).toEqual([]);
    const many = Array.from({ length: 10 }, (_, index) => ({
      email: `user${index}@example.com`,
      usedAt: index,
    }));
    expect(parseSavedProfiles(many)).toHaveLength(6);
    expect(parseSavedProfiles(many)[0]?.email).toBe("user9@example.com");
  });
});
