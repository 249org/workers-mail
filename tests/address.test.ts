import { describe, expect, it } from "vitest";
import {
  domainOf,
  formatAddressList,
  isEmailAddress,
  localPartOf,
  parseAddressList,
} from "@/lib/mail/address";

describe("parseAddressList", () => {
  it("reads bare and angle-bracket forms", () => {
    expect(parseAddressList("a@example.com, Bee <b@example.com>")).toEqual([
      { address: "a@example.com" },
      { name: "Bee", address: "b@example.com" },
    ]);
  });

  it("keeps commas inside quoted display names together", () => {
    expect(parseAddressList('"Doe, Jane" <jane@example.com>')).toEqual([
      { name: "Doe, Jane", address: "jane@example.com" },
    ]);
  });

  it("drops entries that are not addresses", () => {
    expect(parseAddressList("not-an-address, ok@example.com")).toEqual([
      { address: "ok@example.com" },
    ]);
  });

  it("lowercases the address but preserves the display name", () => {
    expect(parseAddressList("Sam <Sam@Example.COM>")).toEqual([
      { name: "Sam", address: "sam@example.com" },
    ]);
  });
});

describe("formatAddressList", () => {
  it("quotes display names and leaves bare addresses alone", () => {
    expect(formatAddressList([{ name: "Bee", address: "b@example.com" }, { address: "c@example.com" }])).toBe(
      '"Bee" <b@example.com>, c@example.com',
    );
  });
});

describe("address helpers", () => {
  it("splits local part and domain", () => {
    expect(localPartOf("Hello@Example.com")).toBe("hello");
    expect(domainOf("Hello@Example.com")).toBe("example.com");
  });

  it("rejects malformed addresses", () => {
    expect(isEmailAddress("a@b")).toBe(false);
    expect(isEmailAddress("a b@example.com")).toBe(false);
    expect(isEmailAddress("a@example.com")).toBe(true);
  });
});
