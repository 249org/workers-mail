import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  accentText,
  THEMES,
  THEME_IDS,
  contrast,
  describeAppearance,
  isLight,
  normalizeHex,
  pairToShareCode,
  paletteFor,
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

describe("every theme comes in light and dark", () => {
  it("has a light version that is light and a dark version that is dark", () => {
    for (const id of THEME_IDS) {
      expect(isLight(THEMES[id].light.background), `${id} light`).toBe(true);
      expect(isLight(THEMES[id].dark.background), `${id} dark`).toBe(false);
    }
  });

  it("keeps text readable on every surface of every version", () => {
    for (const id of THEME_IDS) {
      for (const palette of [THEMES[id].light, THEMES[id].dark]) {
        for (const surface of [palette.sidebar, palette.selected, palette.background]) {
          // WCAG AA for body text.
          expect(contrast(readableOn(surface), surface), `${id} ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps a button's label readable on the accent", () => {
    /*
     * Accents sit mid-range, where the softened body inks fell short: GitHub's blue
     * carried its label at 4.39, Coolify's violet at 3.73.
     */
    for (const id of THEME_IDS) {
      for (const palette of [THEMES[id].light, THEMES[id].dark]) {
        const label = accentText(palette.accent);
        expect(contrast(label, palette.accent), `${id} ${palette.accent}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gives a link in the accent enough contrast to read on the page", () => {
    // Links and focus rings are drawn in the accent on the background itself.
    for (const id of THEME_IDS) {
      for (const palette of [THEMES[id].light, THEMES[id].dark]) {
        expect(contrast(palette.accent, palette.background), `${id} accent`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("picks the version by mode, and by the device for System", () => {
    const nord: Appearance = { theme: { kind: "preset", id: "nord" }, mode: "light", nav: "floating" };
    expect(paletteFor(nord)).toEqual(THEMES.nord.light);
    expect(paletteFor({ ...nord, mode: "dark" })).toEqual(THEMES.nord.dark);
    expect(paletteFor({ ...nord, mode: "system" }, true)).toEqual(THEMES.nord.dark);
    expect(paletteFor({ ...nord, mode: "system" }, false)).toEqual(THEMES.nord.light);
  });
});

describe("reading a saved appearance", () => {
  it("round-trips every kind of choice", () => {
    const choices: Appearance[] = [
      DEFAULT_APPEARANCE,
      { theme: { kind: "preset", id: "dracula" }, mode: "dark", nav: "default" },
      { theme: { kind: "preset", id: "paper" }, mode: "light", nav: "floating" },
      {
        theme: {
          kind: "custom",
          pair: {
            light: { sidebar: "#f0f0f0", selected: "#e0e0e0", accent: "#0050aa", background: "#ffffff" },
            dark: { sidebar: "#101010", selected: "#202020", accent: "#ff6600", background: "#161616" },
          },
        },
        mode: "system",
        nav: "floating",
      },
    ];
    for (const choice of choices) {
      expect(parseAppearance(serializeAppearance(choice))).toEqual(choice);
    }
  });

  it("reads what the previous build saved as the same look", () => {
    /*
     * The last build stored one palette per theme, with GitHub's dark and light as two
     * themes. Coming back must land on the same colours, in the same mode.
     */
    expect(parseAppearance("theme=system;nav=floating")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("theme=github-dark;nav=default")).toEqual({
      theme: { kind: "preset", id: "github" },
      mode: "dark",
      nav: "default",
    });
    expect(parseAppearance("theme=paper;nav=floating")).toMatchObject({
      theme: { kind: "preset", id: "paper" },
      mode: "light",
    });
    expect(parseAppearance("theme=coolify;nav=floating")).toMatchObject({ mode: "dark" });

    const custom = parseAppearance("theme=101010-202020-ff6600-161616;nav=floating");
    expect(custom.mode).toBe("dark");
    expect(paletteFor(custom).accent).toBe("#ff6600");
  });

  it("falls back to the defaults on anything it does not recognise", () => {
    for (const raw of [null, undefined, "", "meridian:system", '{"palette":"ink"}', "%E0%A4%A", "theme=nope"]) {
      expect(parseAppearance(raw)).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it("keeps a good field when its neighbour is bad", () => {
    expect(parseAppearance("theme=ember;mode=sideways;nav=default")).toEqual({
      theme: { kind: "preset", id: "ember" },
      mode: "system",
      nav: "default",
    });
  });

  it("will not take a custom theme missing a half", () => {
    expect(parseAppearance("theme=custom;light=ffffff-eeeeee-0000ff-ffffff;mode=light").theme).toEqual(
      DEFAULT_APPEARANCE.theme,
    );
  });
});

describe("what reaches the stylesheet", () => {
  it("never carries anything but checked colours and fixed names", () => {
    /*
     * The theme is written straight into a <style> tag. A value that slipped through
     * unchecked could close the rule and start one of its own.
     */
    const hostile = parseAppearance(
      "theme=custom;light=000000-000000-000000-000000;dark=000000-000000-000000-000000}body{display:none;mode=dark",
    );
    expect(themeCss(hostile)).not.toContain("display");
    expect(themeCss(parseAppearance("theme=</style><script>;mode=dark"))).not.toContain("script");
  });

  it("switches between a theme's two versions with the device when the mode is System", () => {
    const css = themeCss({ theme: { kind: "preset", id: "forest" }, mode: "system", nav: "floating" });
    expect(css).toContain(THEMES.forest.dark.background);
    expect(css).toContain("@media (prefers-color-scheme: light)");
    expect(css).toContain(THEMES.forest.light.background);
  });

  it("writes only the chosen version when the mode is fixed", () => {
    const css = themeCss({ theme: { kind: "preset", id: "forest" }, mode: "light", nav: "floating" });
    expect(css).toContain(THEMES.forest.light.background);
    expect(css).not.toContain(THEMES.forest.dark.background);
    expect(css).not.toContain("@media");
  });

  it("names the scheme from the colours, so the rest of the page follows", () => {
    expect(paletteVars(THEMES.paper.light)["color-scheme"]).toBe("light");
    expect(paletteVars(THEMES.paper.dark)["color-scheme"]).toBe("dark");
    expect(schemeOf({ theme: { kind: "preset", id: "blossom" }, mode: "dark", nav: "floating" })).toBe("dark");
    expect(schemeOf({ theme: { kind: "preset", id: "blossom" }, mode: "light", nav: "floating" })).toBe("light");
    expect(schemeOf(DEFAULT_APPEARANCE)).toBe("system");
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

  it("shares a theme as eight colours and reads it back", () => {
    const code = pairToShareCode(THEMES.nord);
    expect(code.split(",")).toHaveLength(8);
    expect(parseShareCode(code)).toEqual(THEMES.nord);
  });

  it("reads four colours as one palette for both versions", () => {
    expect(parseShareCode("#2e3440,#434c5e,#88c0d0,#3b4252")).toEqual({
      light: THEMES.nord.dark,
      dark: THEMES.nord.dark,
    });
    expect(parseShareCode("#2e3440,#434c5e")).toBeNull();
  });
});

describe("comparing and naming", () => {
  it("treats the same colours as the same theme however they were reached", () => {
    expect(sameTheme({ kind: "preset", id: "nord" }, { kind: "preset", id: "nord" })).toBe(true);
    expect(sameTheme({ kind: "preset", id: "nord" }, { kind: "preset", id: "slate" })).toBe(false);
    expect(
      sameTheme({ kind: "custom", pair: THEMES.nord }, { kind: "custom", pair: { ...THEMES.nord } }),
    ).toBe(true);
  });

  it("describes the choice for the settings overview", () => {
    expect(describeAppearance(DEFAULT_APPEARANCE)).toBe("GitHub · System");
    expect(describeAppearance({ theme: { kind: "preset", id: "nord" }, mode: "dark", nav: "default" })).toBe(
      "Nord · Dark",
    );
  });
});
