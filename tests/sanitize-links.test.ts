import { describe, expect, it } from "vitest";
import { sanitizeMessageHtml } from "@/lib/mail/sanitize";

/** The address a browser ends up requesting, after it decodes the attribute itself. */
function linkTarget(html: string): string {
  const out = sanitizeMessageHtml(html, false, new Map()).html;
  const href = /href="([^"]*)"/.exec(out)?.[1] ?? "";
  return href.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<");
}

describe("links out of a message", () => {
  it("keeps every query parameter under its own name", () => {
    /*
     * Valid HTML separates query parameters with `&amp;`. Escaping that again on the way
     * out left the browser decoding `&amp;amp;` back to `&amp;`, so `token` arrived as
     * `amp;token` — which is what a sign-up confirmation rejected as malformed.
     */
    const target = linkTarget(
      `<a href="https://accounts.example.com/v1/verify?__clerk_status=verified&amp;token=abc123&amp;redirect_url=https%3A%2F%2Fapp.example.com">Verify</a>`,
    );
    const params = new URL(target).searchParams;
    expect([...params.keys()]).toEqual(["__clerk_status", "token", "redirect_url"]);
    expect(params.get("token")).toBe("abc123");
    expect(params.get("redirect_url")).toBe("https://app.example.com");
  });

  it("leaves a link with one parameter exactly as it was", () => {
    const url = "https://example.com/p?id=7";
    expect(linkTarget(`<a href="${url}">x</a>`)).toBe(url);
  });

  it("does not touch percent-encoding, which is not an entity", () => {
    const url = "https://example.com/s?q=a%26b%20c&n=1";
    expect(linkTarget(`<a href="https://example.com/s?q=a%26b%20c&amp;n=1">x</a>`)).toBe(url);
  });

  it("survives being sanitised twice", () => {
    // Re-rendering a stored body must not escape it a second time either.
    const once = sanitizeMessageHtml(
      `<a href="https://example.com/v?a=1&amp;b=2">x</a>`,
      false,
      new Map(),
    ).html;
    const twice = sanitizeMessageHtml(once, false, new Map()).html;
    const href = /href="([^"]*)"/.exec(twice)?.[1] ?? "";
    expect(href.replace(/&amp;/g, "&")).toBe("https://example.com/v?a=1&b=2");
  });

  it("still refuses a scheme that only looks safe until it is decoded", () => {
    // The browser would run `javascript&#58;` happily; the check now sees it as a scheme.
    for (const href of [
      "javascript&#58;alert(1)",
      "java&#115;cript:alert(1)",
      "&#106;avascript:alert(1)",
      "vbscript&#58;msgbox(1)",
    ]) {
      const out = sanitizeMessageHtml(`<a href="${href}">x</a>`, false, new Map()).html;
      expect(out).not.toContain("href=");
    }
  });

  it("keeps the ordinary schemes working", () => {
    expect(linkTarget('<a href="mailto:a@b.co?subject=Hi&amp;body=There">x</a>')).toBe(
      "mailto:a@b.co?subject=Hi&body=There",
    );
    expect(linkTarget('<a href="/settings">x</a>')).toBe("/settings");
    expect(linkTarget('<a href="#top">x</a>')).toBe("#top");
  });
});
