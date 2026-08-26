"use client";

import { useEffect, useState } from "react";

/**
 * A failed link comes back as ?oauth_error=. Read it once, show it, and strip it from
 * the URL so a refresh does not resurrect a message about something already dealt with.
 */
export function OauthErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const detail = url.searchParams.get("oauth_error");
    if (!detail) return;
    setMessage(detail);
    url.searchParams.delete("oauth_error");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  if (!message) return null;

  return (
    <div className="panel mx-6 mt-4 p-3" role="alert">
      <p className="text-[13px] text-[var(--danger)]">{message}</p>
    </div>
  );
}
