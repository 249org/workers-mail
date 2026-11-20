"use client";

import { useEffect, useRef } from "react";
import { useMailStore } from "@/lib/mail/view-store";
import { badgeLabel, inboxUnread } from "@/lib/mail/unread";
import {
  clearBadgedIcon,
  currentIconHref,
  drawBadgedIcon,
  loadSvgImage,
  showBadgedIcon,
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
  const base = useRef<Promise<HTMLImageElement | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const label = badgeLabel(unread);

    if (!label) {
      clearBadgedIcon();
      return;
    }

    const source = currentIconHref();
    if (!source) return;
    base.current ??= loadSvgImage(source, ICON_PX);
    void base.current.then((image) => {
      if (cancelled || !image) return;
      const url = drawBadgedIcon(image, label, { badge: badgeColor(), text: "#ffffff" });
      if (url) showBadgedIcon(url);
    });

    return () => {
      cancelled = true;
    };
  }, [unread]);

  // Leaving mail behind takes the count with it rather than leaving a stale one up.
  useEffect(() => () => clearBadgedIcon(), []);

  return null;
}
