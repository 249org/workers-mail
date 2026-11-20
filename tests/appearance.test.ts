import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  PRESETS,
  PRESET_IDS,
  contrast,
  describeAppearance,
  normalizeHex,
  paletteToShareCode,
  paletteVars,
  parseAppearance,
  parseShareCode,
  readableOn,
  sameTheme,
  schemeOf,
  serializeAppearance,
  themeCss,
  type Appearance,
} from "@/lib/appearance";

describe("reading a saved appearance", () => {
  it("round-trips every kind of choice", () => {
    const choices: Appearance[] = [
      { theme: { kind: "system" }, nav: "floating" },
      { theme: { kind: "preset", id: "dracula" }, nav: "default" },
      {
        theme: {
          kind: "custom",
          palette: { sidebar: "#101010", selected: "#202020", accent: "#ff6600", background: "#fafafa" },
        },
        nav: "floating",
      },
    ];
    for (const choice of choices) {
      expect(parseAppearance(serializeAppearance(choice))).toEqual(choice);
    }
  });

  it("reads a cookie the browser has percent-encoded", () => {
    const encoded = encodeURIComponent("theme=nord;nav=default");
    expect(parseAppearance(encoded)).toEqual({ theme: { kind: "preset", id: "nord" }, nav: "default" });
  });

  it("falls back to the defaults on anything it does not recognise", () => {
    /*
     * The previous build stored `meridian:system`. Nobody should be left on a broken
     * page because a theme they picked before this one no longer exists.
     */
    for (const raw of [null, undefined, "", "meridian:system", '{"palette":"ink"}', "%E0%A4%A", "theme=nope"]) {
      expect(parseAppearance(raw)).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it("keeps a good field when its neighbour is bad", () => {
    expect(parseAppearance("theme=ember;nav=sideways")).toEqual({
      theme: { kind: "preset", id: "ember" },
      nav: "floating",
    });
  });

  it("will not take a custom theme that is not four colours", () => {
    expect(parseAppearance("theme=101010-202020-ff6600;nav=floating").theme).toEqual({ kind: "system" });
    expect(parseAppearance("theme=101010-202020-zzzzzz-fafafa").theme).toEqual({ kind: "system" });
  });
});

describe("what reaches the stylesheet", () => {
  it("never carries anything but checked colours and fixed names", () => {
    /*
     * The theme is written straight into a <style> tag. A value that slipped through
     * unchecked could close the rule and start one of its own.
     */
    const hostile = parseAppearance("theme=000000-000000-000000-000000;}body{display:none");
    const css = themeCss(hostile.theme);
    expect(css).not.toContain("display");
    expect(css).not.toContain("body");
    expect(parseAppearance("theme=</style><script>").theme).toEqual({ kind: "system" });
  });

  it("follows the device when the choice is System", () => {
    const css = themeCss({ kind: "system" });
    expect(css).toContain(PRESETS["github-dark"].background);
    expect(css).toContain("@media (prefers-color-scheme: light)");
    expect(css).toContain(PRESETS["github-light"].background);
  });

  it("names the colour scheme from the background, so light themes read as light", () => {
    expect(paletteVars(PRESETS.paper)["color-scheme"]).toBe("light");
    expect(paletteVars(PRESETS.coolify)["color-scheme"]).toBe("dark");
    expect(schemeOf({ kind: "preset", id: "blossom" })).toBe("light");
    expect(schemeOf({ kind: "preset", id: "midnight" })).toBe("dark");
    expect(schemeOf({ kind: "system" })).toBe("system");
  });
});

describe("text on a chosen colour", () => {
  it("stays readable on every preset surface", () => {
    for (const id of PRESET_IDS) {
      const palette = PRESETS[id];
      for (const surface of [palette.sidebar, palette.selected, palette.background]) {
        // WCAG AA for body text.
        expect(contrast(readableOn(surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("picks dark ink on a pale colour and pale ink on a dark one", () => {
    expect(readableOn("#ffffff")).toBe("#1f2328");
    expect(readableOn("#000000")).toBe("#e6edf3");
  });
});

describe("colour input", () => {
  it("accepts the ways people write a hex colour", () => {
    expect(normalizeHex("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHex("abcdef")).toBe("#abcdef");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("  #0f0  ")).toBe("#00ff00");
  });

  it("refuses anything else", () => {
    for (const value of ["", "#abcd", "#ggg", "red", "rgb(0,0,0)", "#1234567"]) {
      expect(normalizeHex(value)).toBeNull();
    }
  });

  it("shares a palette as a code and reads it back", () => {
    const code = paletteToShareCode(PRESETS.nord);
    expect(code).toBe("#2e3440,#434c5e,#88c0d0,#3b4252");
    expect(parseShareCode(code)).toEqual(PRESETS.nord);
    expect(parseShareCode("#2e3440 #434c5e #88c0d0 #3b4252")).toEqual(PRESETS.nord);
    expect(parseShareCode("#2e3440,#434c5e")).toBeNull();
  });
});

describe("comparing and naming", () => {
  it("treats the same colours as the same theme however they were reached", () => {
    expect(sameTheme({ kind: "preset", id: "nord" }, { kind: "preset", id: "nord" })).toBe(true);
    expect(sameTheme({ kind: "preset", id: "nord" }, { kind: "preset", id: "slate" })).toBe(false);
    expect(sameTheme({ kind: "system" }, { kind: "system" })).toBe(true);
    expect(
      sameTheme({ kind: "custom", palette: PRESETS.nord }, { kind: "custom", palette: { ...PRESETS.nord } }),
    ).toBe(true);
  });

  it("describes the choice for the settings overview", () => {
    expect(describeAppearance(DEFAULT_APPEARANCE)).toBe("System · Floating");
    expect(describeAppearance({ theme: { kind: "preset", id: "github-dark" }, nav: "default" })).toBe(
      "GitHub Dark · Default",
    );
  });
});
