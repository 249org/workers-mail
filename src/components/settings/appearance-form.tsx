"use client";

import { useEffect, useRef, useState } from "react";
import {
  NAV_LAYOUTS,
  PALETTE_KEYS,
  PRESET_IDS,
  PRESET_NAMES,
  PRESETS,
  SYSTEM_DARK,
  SYSTEM_LIGHT,
  applyAppearance,
  normalizeHex,
  paletteOf,
  paletteToShareCode,
  parseShareCode,
  readableOn,
  sameTheme,
  type Appearance,
  type Palette,
  type ThemeChoice,
} from "@/lib/appearance";
import { useAppearanceStore } from "@/lib/appearance-store";

const COLOR_NAMES: Record<keyof Palette, { name: string; hint: string }> = {
  sidebar: { name: "Sidebar", hint: "The rail and the folder list." },
  selected: { name: "Selected", hint: "The open folder or page in it." },
  accent: { name: "Accent", hint: "Buttons, links and focus." },
  background: { name: "Background", hint: "Where mail is read." },
};

/*
 * A colour picker reports every step of a drag. Each one is painted straight away, but
 * only the one the drag settles on is saved — otherwise a single drag would be dozens
 * of round trips, each overwriting the last.
 */
const SAVE_AFTER_MS = 350;

function prefersDark(): boolean {
  return typeof window === "undefined" || window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppearanceForm() {
  const prefs = useAppearanceStore((state) => state.prefs);
  const setPrefs = useAppearanceStore((state) => state.setPrefs);
  const hydrate = useAppearanceStore((state) => state.hydrate);
  const [draft, setDraft] = useState<Appearance>(prefs);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // A choice made elsewhere — the palette, another tab — replaces whatever is drafted here.
  useEffect(() => setDraft(prefs), [prefs]);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  const palette = paletteOf(draft.theme, prefersDark());

  function choose(next: Appearance) {
    if (pending.current) clearTimeout(pending.current);
    setDraft(next);
    setPrefs(next);
  }

  function preview(theme: ThemeChoice) {
    const next = { ...draft, theme };
    setDraft(next);
    applyAppearance(next);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => setPrefs(next), SAVE_AFTER_MS);
  }

  function setColor(key: keyof Palette, value: string) {
    const hex = normalizeHex(value);
    if (hex) preview({ kind: "custom", palette: { ...palette, [key]: hex } });
  }

  return (
    <div className="appearance-grid">
      <section className="grid content-start gap-3">
        <h2 className="section-title">Theme</h2>
        <div className="grid grid-cols-3 gap-3">
          <PresetTile
            label="System"
            palette={PRESETS[SYSTEM_DARK]}
            split={PRESETS[SYSTEM_LIGHT]}
            active={draft.theme.kind === "system"}
            onSelect={() => choose({ ...draft, theme: { kind: "system" } })}
          />
          {PRESET_IDS.map((id) => (
            <PresetTile
              key={id}
              label={PRESET_NAMES[id]}
              palette={PRESETS[id]}
              active={sameTheme(draft.theme, { kind: "preset", id })}
              onSelect={() => choose({ ...draft, theme: { kind: "preset", id } })}
            />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          System follows the device: GitHub Dark at night, GitHub Light by day. The same
          choices are in <span className="kbd">⌘K</span>.
        </p>
      </section>

      <section className="grid content-start gap-6">
        <Preview palette={palette} />

        <div className="grid gap-2.5">
          <h2 className="section-title">
            Colours
            {draft.theme.kind === "custom" ? (
              <span className="eyebrow ml-2 text-muted-foreground">Custom</span>
            ) : null}
          </h2>
          {PALETTE_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={palette[key]}
                onChange={(event) => setColor(key, event.target.value)}
                aria-label={COLOR_NAMES[key].name}
                className="color-well"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{COLOR_NAMES[key].name}</p>
                <p className="truncate text-[12px] text-muted-foreground">{COLOR_NAMES[key].hint}</p>
              </div>
              <HexField
                value={palette[key]}
                label={`${COLOR_NAMES[key].name} hex`}
                onCommit={(value) => setColor(key, value)}
              />
            </div>
          ))}
        </div>

        <ShareCode
          palette={palette}
          onPalette={(next) => choose({ ...draft, theme: { kind: "custom", palette: next } })}
        />

        <fieldset className="grid gap-2">
          <legend className="section-title mb-2">Layout</legend>
          <div className="scheme-toggle w-fit" role="radiogroup" aria-label="Layout">
            {NAV_LAYOUTS.map((nav) => (
              <button
                key={nav}
                type="button"
                role="radio"
                aria-checked={draft.nav === nav}
                className="scheme-toggle-btn"
                onClick={() => choose({ ...draft, nav })}
              >
                {nav === "floating" ? "Floating" : "Default"}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Floating sets the navigation and the mail apart on a dotted canvas. Default joins
            them edge to edge.
          </p>
        </fieldset>
      </section>
    </div>
  );
}

function PresetTile({
  label,
  palette,
  split,
  active,
  onSelect,
}: {
  label: string;
  palette: Palette;
  split?: Palette;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="preset-tile" aria-pressed={active} onClick={onSelect}>
      <span className="preset-swatch">
        <MiniPalette palette={palette} />
        {split ? (
          <span className="absolute inset-y-0 right-0 flex w-1/2 overflow-hidden">
            <MiniPalette palette={split} />
          </span>
        ) : null}
      </span>
      <span className="preset-label">{label}</span>
    </button>
  );
}

function MiniPalette({ palette }: { palette: Palette }) {
  const onSidebar = readableOn(palette.sidebar);
  const onBackground = readableOn(palette.background);
  return (
    <span className="flex w-full">
      <span className="flex w-[34%] flex-col gap-1 p-1.5" style={{ background: palette.sidebar }}>
        <span className="h-1 w-3/4 rounded-full opacity-60" style={{ background: onSidebar }} />
        <span className="h-2 w-full rounded-[3px]" style={{ background: palette.selected }} />
        <span className="flex gap-0.5">
          <span className="size-1.5 rounded-full opacity-60" style={{ background: onSidebar }} />
          <span className="size-1.5 rounded-full" style={{ background: palette.accent }} />
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-1.5" style={{ background: palette.background }}>
        <span className="h-1 w-3/4 rounded-full opacity-60" style={{ background: onBackground }} />
        <span className="h-1 w-1/2 rounded-full opacity-35" style={{ background: onBackground }} />
        <span
          className="mt-auto h-2.5 w-full rounded-[3px] border"
          style={{ borderColor: `color-mix(in oklab, ${onBackground} 25%, transparent)` }}
        />
      </span>
    </span>
  );
}

/** The mail window in miniature, drawn in the colours being chosen. */
function Preview({ palette }: { palette: Palette }) {
  const onSidebar = readableOn(palette.sidebar);
  const onSelected = readableOn(palette.selected);
  const onBackground = readableOn(palette.background);
  const onAccent = readableOn(palette.accent);
  const line = `color-mix(in oklab, ${onBackground} 18%, transparent)`;
  const rows = [
    { from: "Ali Jallous", subject: "Deal confirmed — next steps", unread: true },
    { from: "Stripe", subject: "Your receipt #2041-7719", unread: false },
  ];

  return (
    <div role="img" aria-label="Preview of the chosen colours" className="appearance-preview">
      <div className="flex w-[38%] flex-col gap-1 p-3" style={{ background: palette.sidebar, color: onSidebar }}>
        <span className="mb-1 text-[13px] font-semibold">Workers Mail</span>
        <span className="rounded-md px-2 py-1" style={{ background: palette.selected, color: onSelected }}>
          Inbox
        </span>
        <span className="rounded-md px-2 py-1 opacity-80">Sent</span>
        <span className="rounded-md px-2 py-1 opacity-80">Archive</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3" style={{ background: palette.background, color: onBackground }}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">Inbox</span>
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-medium"
            style={{ background: palette.accent, color: onAccent }}
          >
            Compose
          </span>
        </div>
        {rows.map((row) => (
          <span key={row.from} className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: line }}>
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: row.unread ? palette.accent : "transparent" }}
            />
            <span className="min-w-0 truncate">
              <span className="font-medium">{row.from}</span>
              <span className="opacity-60"> — {row.subject}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HexField({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        if (normalizeHex(event.target.value)) onCommit(event.target.value);
      }}
      onBlur={() => setText(value)}
      spellCheck={false}
      aria-label={label}
      aria-invalid={normalizeHex(text) ? undefined : true}
      className="field !w-[6.5rem] shrink-0 font-mono text-[12.5px]"
    />
  );
}

/** Four colours as one line of text, to pass a theme to someone or keep it. */
function ShareCode({ palette, onPalette }: { palette: Palette; onPalette: (palette: Palette) => void }) {
  const shareCode = paletteToShareCode(palette);
  const [code, setCode] = useState(shareCode);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCode(shareCode), [shareCode]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The code is still in the field to select by hand.
    }
  }

  return (
    <div className="grid gap-2">
      <h2 className="section-title">Share code</h2>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            const parsed = parseShareCode(event.target.value);
            if (parsed) onPalette(parsed);
          }}
          spellCheck={false}
          aria-label="Share code"
          aria-invalid={parseShareCode(code) ? undefined : true}
          className="field font-mono text-[12.5px]"
        />
        <button type="button" className="btn btn-ghost !h-9 shrink-0" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Paste a code someone sent you to use their colours.
      </p>
    </div>
  );
}
