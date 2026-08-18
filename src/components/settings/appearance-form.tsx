"use client";

import { useEffect } from "react";
import {
  PALETTES,
  SCHEMES,
  type PaletteId,
  type SchemeId,
} from "@/lib/appearance";
import { useAppearanceStore } from "@/lib/appearance-store";

export function AppearanceForm() {
  const prefs = useAppearanceStore((state) => state.prefs);
  const setPrefs = useAppearanceStore((state) => state.setPrefs);
  const hydrate = useAppearanceStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="section-title">Light and dark</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          System follows the operating system. Light and dark stay put. Same choices live in{" "}
          <span className="kbd">⌘K</span>.
        </p>
        <div className="scheme-toggle mt-4" role="radiogroup" aria-label="Colour scheme">
          {SCHEMES.map((scheme) => {
            const active = prefs.scheme === scheme.id;
            return (
              <button
                key={scheme.id}
                type="button"
                role="radio"
                aria-checked={active}
                className="scheme-toggle-btn"
                data-active={active ? "true" : undefined}
                onClick={() => setPrefs({ ...prefs, scheme: scheme.id as SchemeId })}
              >
                {scheme.name}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Colour templates</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Same drawing — hairline panels, pill buttons. Only the inks change. Saved to this
          workspace.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PALETTES.map((palette) => {
            const active = prefs.palette === palette.id;
            return (
              <li key={palette.id}>
                <button
                  type="button"
                  className="palette-tile"
                  data-active={active ? "true" : undefined}
                  onClick={() => setPrefs({ ...prefs, palette: palette.id as PaletteId })}
                >
                  <span className="palette-preview" aria-hidden>
                    <span style={{ background: palette.paper }} />
                    <span style={{ background: palette.ink }} />
                    <span style={{ background: palette.primary }} />
                    <span style={{ background: palette.highlight }} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[13px] font-medium">{palette.name}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">
                      {palette.note}
                    </span>
                  </span>
                  {active && (
                    <span
                      className="shrink-0 font-mono text-[10px] font-medium tracking-[0.15em] uppercase"
                      style={{ color: "var(--primary)" }}
                    >
                      On
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
