"use client";

import type { ReactNode } from "react";

/**
 * The signed-in frame: navigation in one panel, the work in another.
 *
 * With the floating layout the two sit apart on a dotted canvas; with the default one
 * they meet edge to edge. Which is drawn is down to `data-nav` on <html>, so changing
 * it in settings needs no re-render here. On a phone the navigation panel becomes a
 * drawer, opened from the menu button in whatever pane is showing.
 */
export function Frame({
  nav,
  navOpen = false,
  onCloseNav,
  children,
}: {
  nav: ReactNode;
  navOpen?: boolean;
  onCloseNav?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="frame" data-nav-open={navOpen ? "" : undefined}>
      {navOpen ? (
        <button type="button" className="frame-scrim" aria-label="Close navigation" onClick={onCloseNav} />
      ) : null}
      <div className="frame-nav">{nav}</div>
      <div className="frame-main">{children}</div>
    </div>
  );
}

/** The app's own sidebar, beside the rail: its title, its pages, its footer. */
export function FrameSidebar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside className="frame-sidebar" aria-label={label}>
      {children}
    </aside>
  );
}
