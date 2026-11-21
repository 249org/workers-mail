/*
 * Appearance: a theme, whether it is light or dark, and a layout, chosen per person.
 *
 * A theme is a pair of palettes, one for light and one for dark, and a palette is four
 * colours — the sidebar, the selected item in it, the accent, and the page background.
 * Everything else (text, borders, muted text, cards, fields) is derived from those four
 * in CSS, and the text colours are picked here so they stay readable on whatever was
 * chosen. The server renders the result into a <style> tag, so the first paint is
 * already right and there is nothing to flash.
 */

export type Palette = {
  readonly sidebar: string;
  readonly selected: string;
  readonly accent: string;
  readonly background: string;
};

export type ThemePair = {
  readonly light: Palette;
  readonly dark: Palette;
};

export const PALETTE_KEYS = ["sidebar", "selected", "accent", "background"] as const;

export const THEMES = {
  github: {
    light: { sidebar: "#f6f8fa", selected: "#dde3ea", accent: "#0969da", background: "#ffffff" },
    dark: { sidebar: "#010409", selected: "#21262d", accent: "#2f81f7", background: "#0d1117" },
  },
  coolify: {
    light: { sidebar: "#f3f2f8", selected: "#e3def3", accent: "#7c3aed", background: "#ffffff" },
    dark: { sidebar: "#0b0b0e", selected: "#25232c", accent: "#8b5cf6", background: "#131316" },
  },
  midnight: {
    light: { sidebar: "#eef2fb", selected: "#d9e1f4", accent: "#db2777", background: "#ffffff" },
    dark: { sidebar: "#0a1022", selected: "#1e2a4a", accent: "#ec4899", background: "#0f172a" },
  },
  forest: {
    light: { sidebar: "#edf4ef", selected: "#d3e6d9", accent: "#a16207", background: "#fbfdfb" },
    dark: { sidebar: "#0b1d15", selected: "#1d3b2c", accent: "#e8b931", background: "#10261c" },
  },
  ember: {
    light: { sidebar: "#fbf1ec", selected: "#f3dccf", accent: "#c2410c", background: "#fffaf7" },
    dark: { sidebar: "#1f0c09", selected: "#4a1d16", accent: "#f59e0b", background: "#2a120e" },
  },
  slate: {
    light: { sidebar: "#eef1f5", selected: "#dbe1ea", accent: "#2563eb", background: "#ffffff" },
    dark: { sidebar: "#1e2530", selected: "#323d4b", accent: "#60a5fa", background: "#262e3a" },
  },
  nord: {
    light: { sidebar: "#e5e9f0", selected: "#d3dae6", accent: "#5e81ac", background: "#eceff4" },
    dark: { sidebar: "#2e3440", selected: "#434c5e", accent: "#88c0d0", background: "#3b4252" },
  },
  dracula: {
    light: { sidebar: "#f1effa", selected: "#e2dcf7", accent: "#7c4dff", background: "#fbfaff" },
    dark: { sidebar: "#21222c", selected: "#383a4a", accent: "#bd93f9", background: "#282a36" },
  },
  aubergine: {
    light: { sidebar: "#3f0e40", selected: "#1164a3", accent: "#1264a3", background: "#ffffff" },
    dark: { sidebar: "#19091a", selected: "#4c1d4f", accent: "#a78bfa", background: "#1d141e" },
  },
  paper: {
    light: { sidebar: "#ece4d6", selected: "#ddd1bb", accent: "#c2410c", background: "#f8f5ee" },
    dark: { sidebar: "#1c1915", selected: "#38312a", accent: "#e8823d", background: "#24201b" },
  },
  blossom: {
    light: { sidebar: "#fbe4ee", selected: "#f6c3d8", accent: "#db2777", background: "#fff8fb" },
    dark: { sidebar: "#22111a", selected: "#4a2133", accent: "#f472b6", background: "#2a1621" },
  },
} as const satisfies Record<string, ThemePair>;

export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const THEME_NAMES: Record<ThemeId, string> = {
  github: "GitHub",
  coolify: "Coolify",
  midnight: "Midnight",
  forest: "Forest",
  ember: "Ember",
  slate: "Slate",
  nord: "Nord",
  dracula: "Dracula",
  aubergine: "Aubergine",
  paper: "Paper",
  blossom: "Blossom",
};

export type ThemeChoice =
  | { readonly kind: "preset"; readonly id: ThemeId }
  | { readonly kind: "custom"; readonly pair: ThemePair };

/** Light or dark, or whichever the device is set to. */
export const MODES = ["system", "light", "dark"] as const;
export type Mode = (typeof MODES)[number];
export const MODE_NAMES: Record<Mode, string> = { system: "System", light: "Light", dark: "Dark" };

/*
 * Floating sets the navigation and the content down as panels on a dotted canvas.
 * Default joins them edge to edge, for anyone who would rather have the pixels.
 */
export const NAV_LAYOUTS = ["floating", "default"] as const;
export type NavLayout = (typeof NAV_LAYOUTS)[number];

export type Appearance = {
  readonly theme: ThemeChoice;
  readonly mode: Mode;
  readonly nav: NavLayout;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: { kind: "preset", id: "github" },
  mode: "system",
  nav: "floating",
};

export const APPEARANCE_COOKIE = "wm_appearance";
/** The <style> element the theme lives in, so the client can swap it in place. */
export const THEME_STYLE_ID = "wm-theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const HEX = /^#[0-9a-f]{6}$/;

/** Lower-case `#rrggbb`, or null. Accepts `#rgb` and a missing `#`. */
export function normalizeHex(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value.startsWith("#")) value = `#${value}`;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return HEX.test(value) ? value : null;
}

export function isThemeId(value: string): value is ThemeId {
  return Object.hasOwn(THEMES, value);
}

export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

export function isNavLayout(value: string): value is NavLayout {
  return (NAV_LAYOUTS as readonly string[]).includes(value);
}

function parsePalette(values: string[]): Palette | null {
  if (values.length !== 4) return null;
  const hex = values.map(normalizeHex);
  if (hex.some((value) => value === null)) return null;
  const [sidebar, selected, accent, background] = hex as [string, string, string, string];
  return { sidebar, selected, accent, background };
}

function paletteHex(palette: Palette): string[] {
  return PALETTE_KEYS.map((key) => palette[key]);
}

/**
 * Both palettes of a theme as one line of text — light then dark — to pass a theme to
 * someone or keep it. Four colours on their own are read as one palette for both.
 */
export function pairToShareCode(pair: ThemePair): string {
  return [...paletteHex(pair.light), ...paletteHex(pair.dark)].join(",");
}

export function parseShareCode(code: string): ThemePair | null {
  const parts = code.split(/[,\s/]+/).filter(Boolean);
  if (parts.length === 4) {
    const palette = parsePalette(parts);
    return palette ? { light: palette, dark: palette } : null;
  }
  if (parts.length !== 8) return null;
  const light = parsePalette(parts.slice(0, 4));
  const dark = parsePalette(parts.slice(4));
  return light && dark ? { light, dark } : null;
}

/** Cookie value: `theme=<id|custom>;mode=…;nav=…`, plus `light=` and `dark=` for a custom theme. */
export function serializeAppearance(appearance: Appearance): string {
  const { theme } = appearance;
  const fields = [`theme=${theme.kind === "preset" ? theme.id : "custom"}`];
  if (theme.kind === "custom") {
    fields.push(`light=${paletteHex(theme.pair.light).map((hex) => hex.slice(1)).join("-")}`);
    fields.push(`dark=${paletteHex(theme.pair.dark).map((hex) => hex.slice(1)).join("-")}`);
  }
  fields.push(`mode=${appearance.mode}`, `nav=${appearance.nav}`);
  return fields.join(";");
}

/*
 * The previous build stored one palette per theme and named the dark and light GitHub
 * palettes separately. Those values are read as the theme they belonged to, in the mode
 * they were, so nobody comes back to a different look than they left.
 */
const EARLIER: Record<string, { id: ThemeId; mode: Mode }> = {
  system: { id: "github", mode: "system" },
  "github-dark": { id: "github", mode: "dark" },
  "github-light": { id: "github", mode: "light" },
  coolify: { id: "coolify", mode: "dark" },
  midnight: { id: "midnight", mode: "dark" },
  forest: { id: "forest", mode: "dark" },
  ember: { id: "ember", mode: "dark" },
  slate: { id: "slate", mode: "dark" },
  nord: { id: "nord", mode: "dark" },
  dracula: { id: "dracula", mode: "dark" },
  aubergine: { id: "aubergine", mode: "light" },
  paper: { id: "paper", mode: "light" },
  blossom: { id: "blossom", mode: "light" },
};

/** Never throws: anything it does not recognise falls back to the defaults. */
export function parseAppearance(raw: string | null | undefined): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_APPEARANCE;
  }

  const fields = new Map<string, string>();
  for (const part of decoded.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) fields.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }

  const value = fields.get("theme") ?? "";
  const modeField = fields.get("mode") ?? "";
  const navField = fields.get("nav") ?? "";
  let theme: ThemeChoice = DEFAULT_APPEARANCE.theme;
  let mode: Mode = isMode(modeField) ? modeField : DEFAULT_APPEARANCE.mode;

  if (value === "custom") {
    const light = parsePalette((fields.get("light") ?? "").split("-"));
    const dark = parsePalette((fields.get("dark") ?? "").split("-"));
    if (light && dark) theme = { kind: "custom", pair: { light, dark } };
  } else if (!fields.has("mode") && EARLIER[value]) {
    theme = { kind: "preset", id: EARLIER[value].id };
    mode = EARLIER[value].mode;
  } else if (isThemeId(value)) {
    theme = { kind: "preset", id: value };
  } else if (!fields.has("mode") && value.includes("-")) {
    // An earlier custom theme: one palette, kept for both modes and shown as it was.
    const palette = parsePalette(value.split("-"));
    if (palette) {
      theme = { kind: "custom", pair: { light: palette, dark: palette } };
      mode = isLight(palette.background) ? "light" : "dark";
    }
  }

  return { theme, mode, nav: isNavLayout(navField) ? navField : DEFAULT_APPEARANCE.nav };
}

export function appearanceCookie(appearance: Appearance, secure: boolean): string {
  const parts = [
    `${APPEARANCE_COOKIE}=${encodeURIComponent(serializeAppearance(appearance))}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${ONE_YEAR_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function pairOf(theme: ThemeChoice): ThemePair {
  return theme.kind === "custom" ? theme.pair : THEMES[theme.id];
}

/** Whether the page is dark, for a mode of System this means asking the device. */
export function resolveDark(mode: Mode, prefersDark: boolean): boolean {
  return mode === "system" ? prefersDark : mode === "dark";
}

/** The palette on screen for a choice. */
export function paletteFor(appearance: Appearance, prefersDark = true): Palette {
  const pair = pairOf(appearance.theme);
  return resolveDark(appearance.mode, prefersDark) ? pair.dark : pair.light;
}

export function sameTheme(a: ThemeChoice, b: ThemeChoice): boolean {
  if (a.kind === "preset" && b.kind === "preset") return a.id === b.id;
  if (a.kind === "custom" && b.kind === "custom") {
    return pairToShareCode(a.pair) === pairToShareCode(b.pair);
  }
  return false;
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return sameTheme(a.theme, b.theme) && a.mode === b.mode && a.nav === b.nav;
}

/** A short name for the current choice, for the settings overview. */
export function describeAppearance(appearance: Appearance): string {
  const { theme } = appearance;
  const name = theme.kind === "preset" ? THEME_NAMES[theme.id] : "Custom";
  return `${name} · ${MODE_NAMES[appearance.mode]}`;
}

/* ---- colour maths ---- */

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance: 0 is black, 1 is white. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.4;
}

const INK = { dark: "#e6edf3", light: "#1f2328" } as const;

/** Whichever of near-white and near-black reads better on `background`. */
export function readableOn(background: string): string {
  return contrast(INK.dark, background) >= contrast(INK.light, background) ? INK.dark : INK.light;
}

const LABEL = { light: "#ffffff", dark: "#0b0d10" } as const;

/*
 * The label on a button filled with the accent. Accents sit in the middle of the
 * lightness range, where the softened body inks fall short of AA, so a label gets the
 * full white or the near-black instead.
 */
export function accentText(accent: string): string {
  return contrast(LABEL.light, accent) >= contrast(LABEL.dark, accent) ? LABEL.light : LABEL.dark;
}

/** The custom properties one palette sets. */
export function paletteVars(palette: Palette): Record<string, string> {
  return {
    "--wm-sidebar": palette.sidebar,
    "--wm-sidebar-foreground": readableOn(palette.sidebar),
    "--wm-selected": palette.selected,
    "--wm-selected-foreground": readableOn(palette.selected),
    "--wm-accent": palette.accent,
    "--wm-accent-foreground": accentText(palette.accent),
    "--wm-background": palette.background,
    "--wm-foreground": readableOn(palette.background),
    "color-scheme": isLight(palette.background) ? "light" : "dark",
  };
}

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return `${selector}{${body}}`;
}

/**
 * The stylesheet for a choice. Only validated hex values and fixed names can reach it,
 * so it is safe to render straight into a <style> tag.
 */
export function themeCss(appearance: Appearance): string {
  const pair = pairOf(appearance.theme);
  if (appearance.mode === "system") {
    return (
      block(":root", paletteVars(pair.dark)) +
      `@media (prefers-color-scheme: light){${block(":root", paletteVars(pair.light))}}`
    );
  }
  return block(":root", paletteVars(appearance.mode === "dark" ? pair.dark : pair.light));
}

/*
 * Light or dark, as the rest of the stylesheet asks it — the message reader and a few
 * marks still key off `data-scheme`. It is the palette's background that decides, so a
 * custom "light" palette that is really dark is treated as the dark one it looks like.
 */
export function schemeOf(appearance: Appearance): "system" | "light" | "dark" {
  if (appearance.mode === "system") return "system";
  return isLight(paletteFor(appearance).background) ? "light" : "dark";
}

/** Puts a choice on the page without a reload. */
export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement): void {
  let style = document.getElementById(THEME_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = themeCss(appearance);
  root.dataset.scheme = schemeOf(appearance);
  root.dataset.nav = appearance.nav;
}

/** Writes the cookie the server reads on the next request, so a reload paints the same. */
export function persistAppearanceLocal(appearance: Appearance): void {
  document.cookie = appearanceCookie(appearance, window.location.protocol === "https:");
}
