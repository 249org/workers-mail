import { afterEach, describe, expect, it } from "vitest";
import { SHORTCUTS } from "@/lib/keyboard/shortcuts";
import {
  assignBinding,
  combosOverlap,
  findConflicts,
  parseOverrides,
  resetBinding,
  resolveShortcuts,
  setActiveShortcuts,
} from "@/lib/keyboard/bindings";

afterEach(() => {
  setActiveShortcuts(SHORTCUTS);
});

describe("resolveShortcuts", () => {
  it("keeps defaults when nothing is overridden", () => {
    const resolved = resolveShortcuts({});
    expect(resolved.find((item) => item.action === "archive")?.keys).toEqual(["e"]);
  });

  it("replaces keys for an overridden action", () => {
    const resolved = resolveShortcuts({ archive: ["q"] });
    expect(resolved.find((item) => item.action === "archive")?.keys).toEqual(["q"]);
    expect(resolved.find((item) => item.action === "star")?.keys).toEqual(["s"]);
  });

  it("treats an empty array as unbound", () => {
    const resolved = resolveShortcuts({ archive: [] });
    expect(resolved.find((item) => item.action === "archive")?.keys).toEqual([]);
  });
});

describe("parseOverrides", () => {
  it("drops unknown actions and invalid combos", () => {
    expect(
      parseOverrides({
        archive: ["q", "not a chord+++", 12],
        nope: ["e"],
      }),
    ).toEqual({ archive: ["q"] });
  });
});

describe("combosOverlap", () => {
  it("treats a sequence prefix as a collision with the bare key", () => {
    expect(combosOverlap("g i", "g")).toBe(true);
    expect(combosOverlap("g", "g i")).toBe(true);
    expect(combosOverlap("e", "s")).toBe(false);
  });
});

describe("assignBinding", () => {
  it("steals an overlapping key from the other action", () => {
    const next = assignBinding({}, "archive", "j");
    expect(next.archive).toEqual(["j"]);
    expect(next.next).toEqual(["arrowdown"]);
  });

  it("unbinds the other action when the stolen key was its only binding", () => {
    const next = assignBinding({}, "star", "e");
    expect(next.star).toEqual(["e"]);
    expect(next.archive).toEqual([]);
  });

  it("unbinds with null", () => {
    expect(assignBinding({}, "compose", null).compose).toEqual([]);
  });
});

describe("resetBinding", () => {
  it("restores defaults and steals them back", () => {
    const stolen = assignBinding({}, "star", "e");
    const restored = resetBinding(stolen, "archive");
    expect(restored.archive).toBeUndefined();
    expect(resolveShortcuts(restored).find((item) => item.action === "archive")?.keys).toEqual(["e"]);
    expect(restored.star).toEqual([]);
  });
});

describe("findConflicts", () => {
  it("finds the action that currently owns a combo", () => {
    const conflicts = findConflicts("e", "star", SHORTCUTS);
    expect(conflicts.map((item) => item.action)).toEqual(["archive"]);
  });
});
