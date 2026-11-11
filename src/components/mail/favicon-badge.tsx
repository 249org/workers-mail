"use client";

import { useEffect, useRef, useState } from "react";
import { useMailStore } from "@/lib/mail/view-store";
import { badgeLabel, unreadBadgeTotal } from "@/lib/mail/unread";
import {
  currentIconHref,
  drawBadgedIcon,
  loadSvgImage,
  setIconHref,
  ICON_PX,
} from "@/lib/mail/favicon";

/*
 * The open mailbox is already live — its folder counts move the moment anything is read —
 * so only the other accounts need asking after, and they only change when their own sync
 * runs. A minute is well inside that.
 */
const REFRESH_MS = 60_000;

const FALLBACK_BADGE = "#dc3544";

function badgeColor(): string {
  if (typeof window === "undefined") return FALLBACK_BADGE;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--destructive")
    .trim();
  return value || FALLBACK_BADGE;
}

/** Draws the number of unread messages onto the tab icon, the way a chat app does. */
export function FaviconBadge() {
  const mailboxId = useMailStore((state) => state.mailboxId);
  const open = useMailStore((state) => unreadBadgeTotal(state.folders));
  const [elsewhere, setElsewhere] = useState(0);

  // Everything except the mailbox on screen, which the store already counts live.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/mailboxes/unread");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          mailboxes?: Array<{ id: string; unread: number }>;
        };
        if (cancelled) return;
        const others = (payload.mailboxes ?? [])
          .filter((entry) => entry.id !== mailboxId)
          .reduce((sum, entry) => sum + Math.max(0, entry.unread), 0);
        setElsewhere(others);
      } catch {
        // A tab icon is not worth reporting a failed poll over.
      }
    }

    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mailboxId]);

  const original = useRef<string | null>(null);
  const base = useRef<Promise<HTMLImageElement | null> | null>(null);
  const total = open + elsewhere;

  useEffect(() => {
    // Read before anything replaces it, or the mark is lost for the rest of the session.
    original.current ??= currentIconHref();
    const source = original.current;
    if (!source) return;

    let cancelled = false;
    const label = badgeLabel(total);

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
  }, [total]);

  // Leaving mail behind takes the count with it rather than leaving a stale one up.
  useEffect(
    () => () => {
      if (original.current) setIconHref(original.current, "image/svg+xml");
    },
    [],
  );

  return null;
}
