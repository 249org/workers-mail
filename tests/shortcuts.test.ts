import { describe, expect, it } from "vitest";
import { formatComboHint, formatKeys, SHORTCUTS } from "@/lib/keyboard/shortcuts";
import { internals, scopeAllows } from "@/lib/keyboard/use-hotkeys";

const { comboFor, isSequencePrefix } = internals;

function key(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("comboFor", () => {
  it("normalises plain letters to lower case", () => {
    expect(comboFor(key({ key: "J" }))).toBe("j");
  });

  it("collapses meta and control onto one mod token", () => {
    expect(comboFor(key({ key: "k", metaKey: true }))).toBe("mod+k");
    expect(comboFor(key({ key: "k", ctrlKey: true }))).toBe("mod+k");
  });

  it("names shift only for letters, since punctuation already implies it", () => {
    expect(comboFor(key({ key: "A", shiftKey: true }))).toBe("shift+a");
    expect(comboFor(key({ key: "?", shiftKey: true }))).toBe("?");
    expect(comboFor(key({ key: "#", shiftKey: true }))).toBe("#");
  });

  it("ignores lone modifier presses", () => {
    expect(comboFor(key({ key: "Shift" }))).toBeNull();
    expect(comboFor(key({ key: "Meta" }))).toBeNull();
  });

  it("lowercases named keys so bindings can be written plainly", () => {
    expect(comboFor(key({ key: "Escape" }))).toBe("escape");
    expect(comboFor(key({ key: "ArrowDown" }))).toBe("arrowdown");
    expect(comboFor(key({ key: "Enter", metaKey: true }))).toBe("mod+enter");
  });
});

describe("isSequencePrefix", () => {
  it("recognises the go-to prefix", () => {
    expect(isSequencePrefix("g")).toBe(true);
  });

  it("does not treat ordinary action keys as prefixes", () => {
    expect(isSequencePrefix("e")).toBe(false);
    expect(isSequencePrefix("j")).toBe(false);
  });
});

describe("shortcut map", () => {
  it("binds each action exactly once", () => {
    const actions = SHORTCUTS.map((shortcut) => shortcut.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it("does not bind the same bare key to two actions in one scope", () => {
    const seen = new Map<string, string>();
    for (const shortcut of SHORTCUTS) {
      for (const combo of shortcut.keys) {
        const slot = `${shortcut.scope}:${combo}`;
        expect(seen.has(slot)).toBe(false);
        seen.set(slot, shortcut.action);
      }
    }
  });

  it("does not reuse a combo across mail scopes that are live together", () => {
    const live = new Set(["global", "list", "reader"]);
    const seen = new Map<string, string>();
    for (const shortcut of SHORTCUTS) {
      if (!live.has(shortcut.scope)) continue;
      for (const combo of shortcut.keys) {
        expect(seen.has(combo)).toBe(false);
        seen.set(combo, shortcut.action);
      }
    }
  });

  it("opens compose with c only, and keeps f for forward", () => {
    expect(SHORTCUTS.find((shortcut) => shortcut.action === "compose")?.keys).toEqual(["c"]);
    expect(SHORTCUTS.find((shortcut) => shortcut.action === "forward")?.keys).toEqual(["f"]);
  });

  it("lets a modal handle Escape even though back is a global binding", () => {
    expect(scopeAllows("global", "modal")).toBe(true);
    expect(scopeAllows("modal", "modal")).toBe(true);
    expect(scopeAllows("list", "global")).toBe(false);
    expect(scopeAllows("reader", "list")).toBe(false);
  });

  it("keeps every sequence binding under the go prefix", () => {
    const sequences = SHORTCUTS.flatMap((shortcut) =>
      shortcut.keys.filter((combo) => combo.includes(" ")),
    );
    expect(sequences.length).toBeGreaterThan(0);
    for (const combo of sequences) expect(combo.startsWith("g ")).toBe(true);
  });

  it("jumps to Sent with g s", () => {
    expect(SHORTCUTS.find((shortcut) => shortcut.action === "goSent")?.keys).toEqual(["g s"]);
  });
});

describe("formatKeys", () => {
  it("uses platform glyphs for modifiers", () => {
    expect(formatKeys("mod+k", true)).toEqual(["⌘", "K"]);
    expect(formatKeys("mod+k", false)).toEqual(["Ctrl", "K"]);
  });

  it("renders sequences as separate keys", () => {
    expect(formatKeys("g i", true)).toEqual(["G", "I"]);
  });

  it("maps named keys to symbols", () => {
    expect(formatKeys("escape", true)).toEqual(["Esc"]);
    expect(formatKeys("mod+enter", true)).toEqual(["⌘", "↵"]);
  });
});

describe("formatComboHint", () => {
  it("joins mac chords without a separator", () => {
    expect(formatComboHint("mod+k", true)).toBe("⌘K");
    expect(formatComboHint("mod+k", false)).toBe("Ctrl+K");
    expect(formatComboHint("g i", true)).toBe("G I");
  });
});

describe("the jump-to sequences", () => {
  const jumps = SHORTCUTS.filter((shortcut) => shortcut.group === "Jump to");

  it("sends g t to the trash", () => {
    const trash = jumps.find((shortcut) => shortcut.action === "goTrash");
    expect(trash?.keys).toContain("g t");
    expect(isSequencePrefix("g")).toBe(true);
  });

  it("gives every jump its own keys", () => {
    const keys = jumps.flatMap((shortcut) => shortcut.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves the key that opens a sequence unbound on its own", () => {
    /*
     * A tail may repeat a bare key — `g s` beats `s` because a pending prefix is tried
     * first. The head cannot: the dispatcher parks on it and returns, so anything bound
     * to `g` by itself would never fire.
     */
    const bare = new Set(
      SHORTCUTS.flatMap((shortcut) => shortcut.keys).filter((combo) => !combo.includes(" ")),
    );
    const heads = new Set(
      SHORTCUTS.flatMap((shortcut) => shortcut.keys)
        .filter((combo) => combo.includes(" "))
        .map((combo) => combo.split(" ")[0] as string),
    );
    for (const head of heads) expect(bare.has(head)).toBe(false);
  });
});
