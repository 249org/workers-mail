import { describe, expect, it } from "vitest";
import { decodeEntities } from "@/lib/mail/text";

describe("decodeEntities", () => {
  it("turns named dashes and quotes into characters", () => {
    expect(decodeEntities("Report &mdash; Friday")).toBe("Report — Friday");
    expect(decodeEntities("Wait&hellip;")).toBe("Wait…");
    expect(decodeEntities("&ldquo;quoted&rdquo;")).toBe("“quoted”");
  });

  it("decodes numeric and hex entities", () => {
    expect(decodeEntities("&#8212;")).toBe("—");
    expect(decodeEntities("&#x2014;")).toBe("—");
  });

  it("decodes nested amp then named entity", () => {
    expect(decodeEntities("&amp;mdash;")).toBe("—");
  });

  it("leaves plain text alone", () => {
    expect(decodeEntities("Weekly Report")).toBe("Weekly Report");
  });
});
