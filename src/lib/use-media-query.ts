"use client";

import { useEffect, useState } from "react";

/** True when the viewport matches. Desktop-first on the server to avoid a false mobile shell. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export const NARROW_MAIL = "(max-width: 767px)";
