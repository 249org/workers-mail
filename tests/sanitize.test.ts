import { describe, expect, it } from "vitest";
import { plainTextToHtml, sanitizeMessageHtml } from "@/lib/mail/sanitize";

describe("sanitizeMessageHtml", () => {
  it("removes scripts and their contents", () => {
    const { html } = sanitizeMessageHtml('<p>ok</p><script>alert("x")</script>', true);
    expect(html).toBe("<p>ok</p>");
  });

  it("strips event handler attributes", () => {
    const { html } = sanitizeMessageHtml('<p onclick="steal()">hi</p>', true);
    expect(html).toBe("<p>hi</p>");
  });

  it("blocks javascript: links", () => {
    const { html } = sanitizeMessageHtml('<a href="javascript:alert(1)">x</a>', true);
    expect(html).toBe("<a>x</a>");
  });

  it("does not fall for control characters inside a scheme", () => {
    const { html } = sanitizeMessageHtml('<a href="java\tscript:alert(1)">x</a>', true);
    expect(html).toBe("<a>x</a>");
  });

  it("counts and drops remote images until they are allowed", () => {
    const blocked = sanitizeMessageHtml('<img src="https://tracker.example/p.gif" />', false);
    expect(blocked.blockedImages).toBe(1);
    expect(blocked.html).toBe("");

    const allowed = sanitizeMessageHtml('<img src="https://tracker.example/p.gif" />', true);
    expect(allowed.blockedImages).toBe(0);
    expect(allowed.html).toContain("src=\"https://tracker.example/p.gif\"");
  });

  it("adds noreferrer to surviving links", () => {
    const { html } = sanitizeMessageHtml('<a href="https://example.com">x</a>', true);
    expect(html).toContain('rel="noreferrer noopener"');
  });
});

describe("plainTextToHtml", () => {
  it("escapes markup and links bare URLs", () => {
    const html = plainTextToHtml("see <b> https://example.com");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("splits blank lines into paragraphs", () => {
    expect(plainTextToHtml("one\n\ntwo")).toBe("<p>one</p><p>two</p>");
  });
});
