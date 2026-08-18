import { describe, expect, it } from "vitest";
import { normalizeSubject } from "@/lib/mail/thread";

describe("normalizeSubject", () => {
  it("strips reply and forward prefixes", () => {
    expect(normalizeSubject("Re: Fwd: Launch plan")).toBe("Launch plan");
    expect(normalizeSubject("RE: RE: Launch plan")).toBe("Launch plan");
    expect(normalizeSubject("AW: Launch plan")).toBe("Launch plan");
  });

  it("handles numbered reply counters", () => {
    expect(normalizeSubject("Re[2]: Launch plan")).toBe("Launch plan");
  });

  it("leaves ordinary subjects untouched", () => {
    expect(normalizeSubject("Retrospective notes")).toBe("Retrospective notes");
  });
});
