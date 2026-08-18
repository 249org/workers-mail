export const APPEARANCE_COOKIE = "wm_appearance";
export const APPEARANCE_STORAGE_KEY = "workers-mail.appearance";

export const PALETTE_IDS = ["meridian", "harbor", "grove", "ember", "ink", "dusk"] as const;
export const SCHEME_IDS = ["system", "light", "dark"] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];
export type SchemeId = (typeof SCHEME_IDS)[number];

export type AppearancePrefs = {
  palette: PaletteId;
  scheme: SchemeId;
};

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  palette: "meridian",
  scheme: "system",
};

export type PaletteSwatch = {
  id: PaletteId;
  name: string;
  note: string;
  paper: string;
  ink: string;
  primary: string;
  highlight: string;
};

export const PALETTES: PaletteSwatch[] = [
  {
    id: "meridian",
    name: "Meridian",
    note: "Slate-blue and terracotta on warm paper.",
    paper: "#F9F9F8",
    ink: "#18181A",
    primary: "#3B5BDB",
    highlight: "#C45C3E",
  },
  {
    id: "harbor",
    name: "Harbor",
    note: "Teal waterline, sand highlight.",
    paper: "#F4F7F6",
    ink: "#14221F",
    primary: "#0F766E",
    highlight: "#C07848",
  },
  {
    id: "grove",
    name: "Grove",
    note: "Forest green with copper.",
    paper: "#F6F7F2",
    ink: "#1A2218",
    primary: "#2F6B4F",
    highlight: "#B87333",
  },
  {
    id: "ember",
    name: "Ember",
    note: "Warm clay paper, ember actions.",
    paper: "#FBF6F1",
    ink: "#1C1410",
    primary: "#C2410C",
    highlight: "#9A3412",
  },
  {
    id: "ink",
    name: "Ink",
    note: "Near-black type, gold for emphasis.",
    paper: "#F4F4F2",
    ink: "#18181B",
    primary: "#18181B",
    highlight: "#B45309",
  },
  {
    id: "dusk",
    name: "Dusk",
    note: "Indigo evening, terracotta spark.",
    paper: "#F6F5F9",
    ink: "#1B1726",
    primary: "#4F46E5",
    highlight: "#C45C3E",
  },
];

export const SCHEMES: Array<{ id: SchemeId; name: string }> = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export function isPaletteId(value: string): value is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(value);
}

export function isSchemeId(value: string): value is SchemeId {
  return (SCHEME_IDS as readonly string[]).includes(value);
}

export function parseAppearance(raw: string | null | undefined): AppearancePrefs {
  if (!raw) return DEFAULT_APPEARANCE;

  try {
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    return {
      palette: parsed.palette && isPaletteId(parsed.palette) ? parsed.palette : DEFAULT_APPEARANCE.palette,
      scheme: parsed.scheme && isSchemeId(parsed.scheme) ? parsed.scheme : DEFAULT_APPEARANCE.scheme,
    };
  } catch {
    const [palette, scheme] = raw.split(":");
    return {
      palette: palette && isPaletteId(palette) ? palette : DEFAULT_APPEARANCE.palette,
      scheme: scheme && isSchemeId(scheme) ? scheme : DEFAULT_APPEARANCE.scheme,
    };
  }
}

export function serializeAppearance(prefs: AppearancePrefs): string {
  return `${prefs.palette}:${prefs.scheme}`;
}

export function appearanceCookie(prefs: AppearancePrefs, secure: boolean): string {
  const parts = [
    `${APPEARANCE_COOKIE}=${serializeAppearance(prefs)}`,
    "Path=/",
    "SameSite=Lax",
    "Max-Age=31536000",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function applyAppearance(prefs: AppearancePrefs, root: HTMLElement = document.documentElement): void {
  root.dataset.palette = prefs.palette;
  root.dataset.scheme = prefs.scheme;
}

export function readStoredAppearance(): AppearancePrefs {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function persistAppearanceLocal(prefs: AppearancePrefs): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode can refuse storage; the cookie still holds the choice.
  }
  const secure = window.location.protocol === "https:";
  document.cookie = appearanceCookie(prefs, secure);
}

/** Blocking boot so the first paint already knows the saved palette. */
export const APPEARANCE_BOOTSTRAP = `(function(){try{var k='${APPEARANCE_STORAGE_KEY}';var c=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);var fromStore=null;try{fromStore=JSON.parse(localStorage.getItem(k)||'');}catch(e){}var fromCookie=c?decodeURIComponent(c[1]).split(':'):null;var palette=(fromStore&&fromStore.palette)||(fromCookie&&fromCookie[0])||'meridian';var scheme=(fromStore&&fromStore.scheme)||(fromCookie&&fromCookie[1])||'system';var ok=${JSON.stringify(PALETTE_IDS)};var sk=${JSON.stringify(SCHEME_IDS)};if(ok.indexOf(palette)<0)palette='meridian';if(sk.indexOf(scheme)<0)scheme='system';document.documentElement.dataset.palette=palette;document.documentElement.dataset.scheme=scheme;}catch(e){}})();`;
