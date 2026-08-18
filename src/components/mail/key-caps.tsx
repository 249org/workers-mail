"use client";

import { useEffect, useState } from "react";
import { formatKeys } from "@/lib/keyboard/shortcuts";

export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform) || navigator.userAgent.includes("Mac"));
  }, []);
  return isMac;
}

export function KeyCaps({ combo, isMac }: { combo: string; isMac: boolean }) {
  const keys = formatKeys(combo, isMac);
  const sequence = combo.includes(" ");

  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, index) => (
        <span key={`${combo}-${index}`} className="contents">
          {sequence && index > 0 ? (
            <span className="px-0.5 text-[13px] text-muted-foreground">then</span>
          ) : null}
          <span className="kbd">{key}</span>
        </span>
      ))}
    </span>
  );
}
