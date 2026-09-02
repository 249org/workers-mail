/*
 * A mail client renders markup written by strangers. The sanitiser is what keeps that
 * safe, and these headers are what stands behind it when the sanitiser is wrong — which
 * is a question of when, given how much of email predates any of this.
 *
 * `script-src` still needs 'unsafe-inline' because the framework ships hydration data in
 * inline scripts; a nonce would need the request to reach a middleware that can stamp
 * one, which OpenNext does not give us here. Even so the policy blocks the parts of an
 * injection that do the damage: no plugins, no framing, no rewriting the base URI, no
 * posting a form somewhere else, and nothing talking to another origin.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self'",
  // Remote images stay blocked until the reader asks for them; that gate is in the
  // sanitiser, and this only decides where they may come from once it opens.
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: https:",
  "font-src 'self' data:",
  // Mail carries its look in style attributes, so inline styles cannot be refused.
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
].join("; ");

const HEADERS: Array<[string, string]> = [
  ["content-security-policy", CSP],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  // Links open at the sender's site; the address of a private mailbox is not their business.
  ["referrer-policy", "no-referrer"],
  ["cross-origin-opener-policy", "same-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()"],
];

/**
 * Adds the headers a response is missing, leaving any it set for itself. An attachment is
 * served under its own far stricter policy, and overwriting that would loosen it.
 */
export function withSecurityHeaders(response: Response, secure: boolean): Response {
  // A 101 carries no headers to set, and touching one breaks the upgrade.
  if (response.status === 101 || !response.headers) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of HEADERS) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (secure && !headers.has("strict-transport-security")) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
    // Preserves the WebSocket a stream upgrade returns.
    webSocket: (response as Response & { webSocket?: WebSocket }).webSocket,
  } as ResponseInit);
}
