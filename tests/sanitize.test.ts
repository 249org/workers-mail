import { describe, expect, it } from "vitest";
import { inlineSrcMap, plainTextToHtml, sanitizeMessageHtml } from "@/lib/mail/sanitize";

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
    expect(blocked.html).toContain("data-blocked");
    expect(blocked.html).toContain("data:image/svg+xml");
    expect(blocked.html).not.toContain("tracker.example");

    const allowed = sanitizeMessageHtml('<img src="https://tracker.example/p.gif" />', true);
    expect(allowed.blockedImages).toBe(0);
    expect(allowed.html).toContain('src="https://tracker.example/p.gif"');
  });

  it("adds noreferrer to surviving links", () => {
    const { html } = sanitizeMessageHtml('<a href="https://example.com">x</a>', true);
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("rewrites cid images onto the attachment URL", () => {
    const map = inlineSrcMap([
      { id: "att_logo", filename: "logo.png", contentId: "image001.jpg@01DC" },
    ]);
    const { html, blockedImages } = sanitizeMessageHtml(
      '<img width="200" src="cid:image001.jpg@01DC" alt="logo" />',
      false,
      map,
    );
    expect(blockedImages).toBe(0);
    expect(html).toContain('src="/api/attachments/att_logo"');
    expect(html).toContain('width="200"');
    expect(html).not.toContain("cid:");
  });

  it("matches cid local-part to filename when Content-ID is missing", () => {
    const map = inlineSrcMap([{ id: "att_1", filename: "image001.png", contentId: null }]);
    const { html } = sanitizeMessageHtml(
      '<img src="cid:image001.png@01DCABC" />',
      false,
      map,
    );
    expect(html).toContain('src="/api/attachments/att_1"');
  });

  it("drops unresolved cid images without calling them remote", () => {
    const { html, blockedImages } = sanitizeMessageHtml(
      '<img width="80" src="cid:missing@host" />',
      false,
    );
    expect(html).toBe("");
    expect(blockedImages).toBe(0);
  });

  it("blocks protocol-relative image URLs until remote images are allowed", () => {
    const blocked = sanitizeMessageHtml('<img src="//cdn.example/x.png" />', false);
    expect(blocked.blockedImages).toBe(1);
    expect(blocked.html).not.toContain("cdn.example");

    const allowed = sanitizeMessageHtml('<img src="//cdn.example/x.png" />', true);
    expect(allowed.html).toContain('src="https://cdn.example/x.png"');
  });

  it("keeps newsletter colour and buttons from inline styles", () => {
    const { html } = sanitizeMessageHtml(
      '<td bgcolor="#111111" style="padding: 24px"><a href="https://posthog.com" style="background-color: #F54E00; color: #ffffff; padding: 12px 20px; text-decoration: none">Head to the Hub</a></td>',
      false,
    );
    expect(html).toContain('bgcolor="#111111"');
    expect(html).toContain("background-color: #F54E00");
    expect(html).toContain("color: #ffffff");
    expect(html).toContain("text-decoration: none");
    expect(html).not.toContain("onclick");
  });

  it("strips javascript from style values", () => {
    const { html } = sanitizeMessageHtml(
      '<p style="color: red; background: url(javascript:alert(1))">x</p>',
      true,
    );
    expect(html).toContain("color: red");
    expect(html).not.toContain("javascript");
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

  it("turns all-caps section lines into headings", () => {
    expect(plainTextToHtml("CALLS TODAY\nArsalan Iqbal    20")).toBe(
      "<h2>CALLS TODAY</h2><p>Arsalan Iqbal    20</p>",
    );
  });

  it("does not treat currency or mixed-case lines as headings", () => {
    expect(plainTextToHtml("AED 500,000")).toBe("<p>AED 500,000</p>");
    expect(plainTextToHtml("Daily Sales Report")).toBe("<p>Daily Sales Report</p>");
  });
});
