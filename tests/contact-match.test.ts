import { describe, expect, it } from "vitest";
import { matchContacts } from "@/lib/mail/contact-match";

const contacts = [
  { id: "1", email: "ayman@example.com", name: "Ayman Idrees" },
  { id: "2", email: "sam@example.com", name: "Sam" },
  { id: "3", email: "notes@example.com", name: null },
];

describe("matchContacts", () => {
  it("matches name or address and skips people already in the field", () => {
    expect(matchContacts(contacts, "aym", []).map((row) => row.email)).toEqual(["ayman@example.com"]);
    expect(matchContacts(contacts, "example.com", ["sam@example.com"]).map((row) => row.email)).toEqual([
      "ayman@example.com",
      "notes@example.com",
    ]);
  });

  it("stays quiet until there is a token to match", () => {
    expect(matchContacts(contacts, "  ", [])).toEqual([]);
  });
});
