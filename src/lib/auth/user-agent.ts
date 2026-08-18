/** Short label for a session list. Not a full UA parser — just enough to tell devices apart. */
export function describeUserAgent(ua: string | undefined): string {
  const value = ua?.trim() || "Unknown browser";
  const browser = /Edg\//.test(value)
    ? "Edge"
    : /Chrome\//.test(value) && !/Chromium/.test(value)
      ? "Chrome"
      : /Firefox\//.test(value)
        ? "Firefox"
        : /Safari\//.test(value) && !/Chrome/.test(value)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(value)
    ? "iOS"
    : /Android/.test(value)
      ? "Android"
      : /Mac OS X/.test(value)
        ? "macOS"
        : /Windows/.test(value)
          ? "Windows"
          : /Linux/.test(value)
            ? "Linux"
            : null;
  return os ? `${browser} · ${os}` : browser;
}

export function sessionMeta(request: Request): { userAgent: string; ip: string } {
  return {
    userAgent: request.headers.get("user-agent")?.slice(0, 180) ?? "",
    ip: request.headers.get("cf-connecting-ip") ?? "unknown",
  };
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}
