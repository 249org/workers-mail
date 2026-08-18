"use client";

import { useEffect, useState } from "react";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  PALETTES,
  persistAppearanceLocal,
  readStoredAppearance,
  SCHEMES,
  type AppearancePrefs,
  type PaletteId,
  type SchemeId,
} from "@/lib/appearance";

export function AppearanceForm() {
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULT_APPEARANCE);

  useEffect(() => {
    const local = readStoredAppearance();
    setPrefs(local);
    applyAppearance(local);

    let cancelled = false;
    void fetch("/api/appearance")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const saved = (payload as { prefs?: AppearancePrefs | null } | null)?.prefs;
        if (saved) {
          setPrefs(saved);
          applyAppearance(saved);
          persistAppearanceLocal(saved);
          return;
        }
        persistAppearanceLocal(local);
        void fetch("/api/appearance", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(local),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(next: AppearancePrefs) {
    setPrefs(next);
    applyAppearance(next);
    persistAppearanceLocal(next);
    void fetch("/api/appearance", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="section-title">Light and dark</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          System follows the operating system. Light and dark stay put.
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
                onClick={() => choose({ ...prefs, scheme: scheme.id as SchemeId })}
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
                  onClick={() => choose({ ...prefs, palette: palette.id as PaletteId })}
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
