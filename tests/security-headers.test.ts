import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../worker/security-headers";

function csp(response: Response): string {
  return response.headers.get("content-security-policy") ?? "";
}

describe("withSecurityHeaders", () => {
  it("sets the headers a plain response has none of", () => {
    const out = withSecurityHeaders(new Response("hi"), true);
    expect(out.headers.get("x-content-type-options")).toBe("nosniff");
    expect(out.headers.get("x-frame-options")).toBe("DENY");
    expect(out.headers.get("referrer-policy")).toBe("no-referrer");
    expect(out.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(csp(out)).toContain("frame-ancestors 'none'");
  });

  it("shuts the doors an injected page would reach for", () => {
    const policy = csp(withSecurityHeaders(new Response("hi"), true));
    // Even granting inline scripts, these are what turn an injection into a breach.
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-src 'none'");
  });

  it("still lets a message load the pictures it was written with", () => {
    // Remote images are gated in the sanitiser; the policy only says where from.
    const policy = csp(withSecurityHeaders(new Response("hi"), true));
    expect(policy).toContain("img-src 'self' data: blob: https:");
    // Mail carries its look in style attributes, which cannot be refused.
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("leaves a response that set its own policy alone", () => {
    /*
     * An attachment is served under `default-src 'none'; sandbox`, which is far stricter
     * than the page policy. Overwriting it would loosen the one that matters most.
     */
    const strict = new Response("bytes", {
      headers: { "content-security-policy": "default-src 'none'; sandbox" },
    });
    expect(csp(withSecurityHeaders(strict, true))).toBe("default-src 'none'; sandbox");
  });

  it("asks for HSTS only where it can be honoured", () => {
    expect(withSecurityHeaders(new Response("hi"), true).headers.get("strict-transport-security"))
      .toContain("max-age=31536000");
    expect(
      withSecurityHeaders(new Response("hi"), false).headers.get("strict-transport-security"),
    ).toBeNull();
  });

  it("keeps the body, status and existing headers", () => {
    const original = new Response("payload", {
      status: 201,
      headers: { "content-type": "text/plain", "set-cookie": "a=b" },
    });
    const out = withSecurityHeaders(original, true);
    expect(out.status).toBe(201);
    expect(out.headers.get("content-type")).toBe("text/plain");
    expect(out.headers.get("set-cookie")).toBe("a=b");
  });

  it("does not touch a websocket upgrade", () => {
    /*
     * A 101 carries no headers to set and rewrapping it drops the socket. Node refuses to
     * construct one at all, so the upgrade workerd returns is stood in for here.
     */
    const upgrade = { status: 101, headers: new Headers() } as unknown as Response;
    expect(withSecurityHeaders(upgrade, true)).toBe(upgrade);
  });
});
