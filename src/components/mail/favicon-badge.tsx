"use client";

import { useEffect, useRef } from "react";
import { useMailStore } from "@/lib/mail/view-store";
import { badgeLabel, inboxUnread } from "@/lib/mail/unread";
import {
  currentIconHref,
  drawBadgedIcon,
  loadSvgImage,
  setIconHref,
  ICON_PX,
} from "@/lib/mail/favicon";

const FALLBACK_BADGE = "#dc3544";

function badgeColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--destructive")
    .trim();
  return value || FALLBACK_BADGE;
}

/**
 * Draws the number of unread messages onto the tab icon, the way a chat app does.
 *
 * It reads the same count the sidebar puts next to Inbox, and from the same place, so
 * the tab and the window can never disagree and the number can always be checked.
 */
export function FaviconBadge() {
  const unread = useMailStore((state) => inboxUnread(state.folders));
  const original = useRef<string | null>(null);
  const base = useRef<Promise<HTMLImageElement | null> | null>(null);

  useEffect(() => {
    // Read before anything replaces it, or the mark is lost for the rest of the session.
    original.current ??= currentIconHref();
    const source = original.current;
    if (!source) return;

    let cancelled = false;
    const label = badgeLabel(unread);

    if (!label) {
      setIconHref(source, "image/svg+xml");
      return;
    }

    base.current ??= loadSvgImage(source, ICON_PX);
    void base.current.then((image) => {
      if (cancelled || !image) return;
      const url = drawBadgedIcon(image, label, { badge: badgeColor(), text: "#ffffff" });
      if (url) setIconHref(url, "image/png");
    });

    return () => {
      cancelled = true;
    };
  }, [unread]);

  // Leaving mail behind takes the count with it rather than leaving a stale one up.
  useEffect(
    () => () => {
      if (original.current) setIconHref(original.current, "image/svg+xml");
    },
    [],
  );

  return null;
}
