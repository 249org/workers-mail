"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/*
 * Drawn here, from the URI already in the page. The obvious shortcut is one of the QR
 * image services, and it would hand the shared secret to whoever runs it — the whole
 * second factor, in a URL, in their logs. Nothing about this code leaves the browser.
 */
export function TotpQr({ otpauth, label }: { otpauth: string; label: string }) {
  const code = useMemo(() => {
    if (!otpauth) return null;
    try {
      // Medium correction is what authenticator apps are built around, and the quiet
      // zone is part of the symbol: without it a scanner cannot find the edges.
      return encode(otpauth, { ecc: "M", border: 2 });
    } catch {
      return null;
    }
  }, [otpauth]);

  if (!code) return null;

  const cells: string[] = [];
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) {
      if (code.data[y]?.[x]) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return (
    <svg
      className="totp-qr"
      viewBox={`0 0 ${code.size} ${code.size}`}
      role="img"
      aria-label={`Set up ${label} in an authenticator app`}
      shapeRendering="crispEdges"
    >
      {/* The light squares are as much a part of the symbol as the dark ones, so the
          code carries its own white ground rather than trusting the page behind it. */}
      <rect width={code.size} height={code.size} fill="#fff" />
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}
