/*
 * Appearance: a colour theme and a layout, chosen per person.
 *
 * A theme is four colours — the sidebar, the selected item in it, the accent, and the
 * page background. Everything else (text, borders, muted text, cards, fields) is derived
 * from those four in CSS, and the text colours are picked here so they stay readable on
 * whatever was chosen. The server renders the result into a <style> tag, so the first
 * paint is already right and there is nothing to flash.
 */

export type Palette = {
  readonly sidebar: string;
  readonly selected: string;
  readonly accent: string;
  readonly background: string;
};

export const PALETTE_KEYS = ["sidebar", "selected", "accent", "background"] as const;

export const PRESETS = {
  coolify: { sidebar: "#0b0b0e", selected: "#25232c", accent: "#8b5cf6", background: "#131316" },
  midnight: { sidebar: "#0a1022", selected: "#1e2a4a", accent: "#ec4899", background: "#0f172a" },
  forest: { sidebar: "#0b1d15", selected: "#1d3b2c", accent: "#e8b931", background: "#10261c" },
  ember: { sidebar: "#1f0c09", selected: "#4a1d16", accent: "#f59e0b", background: "#2a120e" },
  slate: { sidebar: "#1e2530", selected: "#323d4b", accent: "#60a5fa", background: "#262e3a" },
  nord: { sidebar: "#2e3440", selected: "#434c5e", accent: "#88c0d0", background: "#3b4252" },
  dracula: { sidebar: "#21222c", selected: "#383a4a", accent: "#bd93f9", background: "#282a36" },
  "github-dark": { sidebar: "#010409", selected: "#21262d", accent: "#2f81f7", background: "#0d1117" },
  aubergine: { sidebar: "#3f0e40", selected: "#1164a3", accent: "#1264a3", background: "#ffffff" },
  "github-light": { sidebar: "#f6f8fa", selected: "#dde3ea", accent: "#0969da", background: "#ffffff" },
  paper: { sidebar: "#ece4d6", selected: "#ddd1bb", accent: "#c2410c", background: "#f8f5ee" },
  blossom: { sidebar: "#fbe4ee", selected: "#f6c3d8", accent: "#db2777", background: "#fff8fb" },
} as const satisfies Record<string, Palette>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export const PRESET_NAMES: Record<PresetId, string> = {
  coolify: "Coolify",
  midnight: "Midnight",
  forest: "Forest",
  ember: "Ember",
  slate: "Slate",
  nord: "Nord",
  dracula: "Dracula",
  "github-dark": "GitHub Dark",
  aubergine: "Aubergine",
  "github-light": "GitHub Light",
  paper: "Paper",
  blossom: "Blossom",
};

/** What "System" resolves to, either side of the device setting. */
export const SYSTEM_DARK: PresetId = "github-dark";
export const SYSTEM_LIGHT: PresetId = "github-light";

export type ThemeChoice =
  | { readonly kind: "system" }
  | { readonly kind: "preset"; readonly id: PresetId }
  | { readonly kind: "custom"; readonly palette: Palette };

/*
 * Floating sets the navigation and the content down as two panels on a dotted canvas.
 * Default joins them edge to edge, for anyone who would rather have the pixels.
 */
export const NAV_LAYOUTS = ["floating", "default"] as const;
export type NavLayout = (typeof NAV_LAYOUTS)[number];

export type Appearance = {
  readonly theme: ThemeChoice;
  readonly nav: NavLayout;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: { kind: "system" },
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

export function isPresetId(value: string): value is PresetId {
  return Object.hasOwn(PRESETS, value);
}

export function isNavLayout(value: string): value is NavLayout {
  return (NAV_LAYOUTS as readonly string[]).includes(value);
}

/** `#010409,#21262d,#2f81f7,#0d1117` — sidebar, selected, accent, background. */
export function paletteToShareCode(palette: Palette): string {
  return PALETTE_KEYS.map((key) => palette[key]).join(",");
}

export function parseShareCode(code: string): Palette | null {
  const parts = code.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 4) return null;
  const hex = parts.map(normalizeHex);
  if (hex.some((value) => value === null)) return null;
  const [sidebar, selected, accent, background] = hex as [string, string, string, string];
  return { sidebar, selected, accent, background };
}

/** Cookie value: `theme=<system | preset id | four hex values joined by ->;nav=…` */
export function serializeAppearance(appearance: Appearance): string {
  const { theme } = appearance;
  const value =
    theme.kind === "system"
      ? "system"
      : theme.kind === "preset"
        ? theme.id
        : PALETTE_KEYS.map((key) => theme.palette[key].slice(1)).join("-");
  return `theme=${value};nav=${appearance.nav}`;
}

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

  const value = fields.get("theme") ?? "system";
  let theme: ThemeChoice = DEFAULT_APPEARANCE.theme;
  if (isPresetId(value)) theme = { kind: "preset", id: value };
  else if (value.includes("-")) {
    const palette = parseShareCode(value.split("-").join(","));
    if (palette) theme = { kind: "custom", palette };
  }

  const nav = fields.get("nav") ?? "";
  return { theme, nav: isNavLayout(nav) ? nav : DEFAULT_APPEARANCE.nav };
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

export function paletteOf(theme: ThemeChoice, prefersDark = true): Palette {
  if (theme.kind === "custom") return theme.palette;
  if (theme.kind === "preset") return PRESETS[theme.id];
  return PRESETS[prefersDark ? SYSTEM_DARK : SYSTEM_LIGHT];
}

export function sameTheme(a: ThemeChoice, b: ThemeChoice): boolean {
  if (a.kind === "preset" && b.kind === "preset") return a.id === b.id;
  if (a.kind === "custom" && b.kind === "custom") {
    return paletteToShareCode(a.palette) === paletteToShareCode(b.palette);
  }
  return a.kind === b.kind;
}

/** A short name for the current choice, for the settings overview. */
export function describeAppearance(appearance: Appearance): string {
  const { theme } = appearance;
  const name =
    theme.kind === "system" ? "System" : theme.kind === "preset" ? PRESET_NAMES[theme.id] : "Custom";
  return `${name} · ${appearance.nav === "floating" ? "Floating" : "Default"}`;
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

/** The custom properties one palette sets. */
export function paletteVars(palette: Palette): Record<string, string> {
  return {
    "--wm-sidebar": palette.sidebar,
    "--wm-sidebar-foreground": readableOn(palette.sidebar),
    "--wm-selected": palette.selected,
    "--wm-selected-foreground": readableOn(palette.selected),
    "--wm-accent": palette.accent,
    "--wm-accent-foreground": readableOn(palette.accent),
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
export function themeCss(theme: ThemeChoice): string {
  if (theme.kind === "system") {
    return (
      block(":root", paletteVars(PRESETS[SYSTEM_DARK])) +
      `@media (prefers-color-scheme: light){${block(":root", paletteVars(PRESETS[SYSTEM_LIGHT]))}}`
    );
  }
  return block(":root", paletteVars(paletteOf(theme)));
}

/*
 * Light or dark, as the rest of the stylesheet asks it — the message reader and a few
 * marks still key off `data-scheme`. A palette decides it by its background, so a light
 * custom theme is treated as light without anyone having to say so.
 */
export function schemeOf(theme: ThemeChoice): "system" | "light" | "dark" {
  if (theme.kind === "system") return "system";
  return isLight(paletteOf(theme).background) ? "light" : "dark";
}

/** Puts a choice on the page without a reload. */
export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement): void {
  let style = document.getElementById(THEME_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = themeCss(appearance.theme);
  root.dataset.scheme = schemeOf(appearance.theme);
  root.dataset.nav = appearance.nav;
}

/** Writes the cookie the server reads on the next request, so a reload paints the same. */
export function persistAppearanceLocal(appearance: Appearance): void {
  document.cookie = appearanceCookie(appearance, window.location.protocol === "https:");
}
