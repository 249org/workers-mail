// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BODY_STYLE, toEmailHtml } from "@/lib/mail/email-html";
import { formatHtml, htmlToText, previewDocument, readPreviewDocument } from "@/lib/mail/compose-html";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** The style a given element ends up with, read the way a mail client would. */
function styleOf(html: string, selector: string): string {
  return parse(html).querySelector(selector)?.getAttribute("style") ?? "";
}

describe("making the editor's markup survive a mail client", () => {
  it("draws a table's borders inline, where Outlook can see them", () => {
    /*
     * Without these a table arrives as words floating in rows: most clients drop a
     * stylesheet, and the editor's look lives in one.
     */
    const out = toEmailHtml("<table><tbody><tr><th><p>Name</p></th></tr><tr><td><p>Ali</p></td></tr></tbody></table>");
    expect(styleOf(out, "table")).toContain("border-collapse:collapse");
    expect(styleOf(out, "td")).toContain("border:1px solid #d0d7de");
    expect(styleOf(out, "td")).toContain("padding:6px 10px");
    expect(styleOf(out, "th")).toContain("font-weight:600");
  });

  it("keeps a cell from swelling with its paragraph's margin", () => {
    const out = toEmailHtml("<table><tbody><tr><td><p>One</p><p>Two</p></td></tr></tbody></table>");
    const paragraphs = parse(out).querySelectorAll("td p");
    expect(paragraphs[0]?.getAttribute("style")).toContain("margin:0 0 12px");
    expect(paragraphs[1]?.getAttribute("style")).toContain("margin-bottom:0");
  });

  it("never overrides a style chosen in the editor", () => {
    // A centred heading and a red word are inline styles already; they must win.
    const out = toEmailHtml('<h2 style="text-align: center">Hi</h2><p><span style="color: #c0392b">red</span></p>');
    expect(styleOf(out, "h2")).toContain("text-align:center");
    expect(styleOf(out, "h2")).toContain("font-size:21px");
    expect(styleOf(out, "span")).toBe("color: #c0392b");
  });

  it("lets a cell keep its own colour over the default", () => {
    const out = toEmailHtml('<table><tbody><tr><th style="background: #000">H</th></tr></tbody></table>');
    expect(styleOf(out, "th")).toContain("background:#000");
    expect(styleOf(out, "th")).not.toContain("#f6f8fa");
  });

  it("styles a code block once, not its code twice", () => {
    const out = toEmailHtml("<pre><code>let a = 1</code></pre><p>Use <code>a</code></p>");
    expect(styleOf(out, "pre")).toContain("font-family:Menlo");
    expect(parse(out).querySelector("pre code")?.getAttribute("style")).toBeNull();
    expect(styleOf(out, "p code")).toContain("background:#f6f8fa");
  });

  it("sets the body's type, so every client starts from the same page", () => {
    const out = toEmailHtml("<p>Hello</p>");
    expect(out.startsWith(`<div style="${BODY_STYLE}">`)).toBe(true);
    // Read back as a client would: the whole font list, size and colour intact.
    const wrapper = parse(out).querySelector("div");
    expect(wrapper?.getAttribute("style")).toBe(BODY_STYLE);
    expect(wrapper?.attributes).toHaveLength(1);
    expect(BODY_STYLE).toContain("'Segoe UI'");
  });

  it("changes nothing the second time round", () => {
    // Switching to the code and back runs it again; nothing may nest or double up.
    const once = toEmailHtml("<table><tbody><tr><td><p>A</p></td></tr></tbody></table><blockquote><p>q</p></blockquote>");
    expect(toEmailHtml(once)).toBe(once);
  });

  it("keeps blank lines and empty table rows their height", () => {
    // An empty <p> has no height in a mail client; blank rows used to shrink to nothing.
    const out = toEmailHtml("<p>One</p><p></p><p>Two</p><table><tbody><tr><td><p></p></td></tr></tbody></table>");
    const empty = parse(out).querySelectorAll("p");
    expect(empty[1]?.innerHTML).toBe("<br>");
    expect(parse(out).querySelector("td p")?.innerHTML).toBe("<br>");
    expect(empty[0]?.innerHTML).toBe("One");
  });

  it("keeps the table's columns as even as they were in the editor", () => {
    expect(styleOf(toEmailHtml("<table><tbody><tr><td>a</td></tr></tbody></table>"), "table")).toContain(
      "table-layout:fixed",
    );
  });

  it("leaves list items one line each", () => {
    const out = toEmailHtml("<ul><li><p>One</p></li><li><p>Two</p></li></ul>");
    expect(styleOf(out, "li p")).toContain("margin-bottom:0");
    expect(styleOf(out, "ul")).toContain("padding-left:24px");
  });
});

describe("reading an edited preview back", () => {
  it("returns a fragment as the fragment it was", () => {
    const doc = parse(previewDocument("<p>Hello <b>there</b></p>"));
    expect(readPreviewDocument(doc, false)).toBe("<p>Hello <b>there</b></p>");
  });

  it("carries an edit made in the page", () => {
    const doc = parse(previewDocument('<table><tbody><tr><td style="color:red">Sale</td></tr></tbody></table>'));
    const cell = doc.querySelector("td");
    if (cell) cell.textContent = "Sale ends Friday";
    expect(readPreviewDocument(doc, false)).toBe(
      '<table><tbody><tr><td style="color:red">Sale ends Friday</td></tr></tbody></table>',
    );
  });

  it("takes out everything the preview added for itself", () => {
    /*
     * The white page and the new-tab links belong to the preview. Sending them would
     * change how the message looks in a client that honours them.
     */
    const full = '<!doctype html><html><head><title>Issue 4</title></head><body style="margin:0"><p>Hi</p></body></html>';
    const doc = parse(previewDocument(full));
    const back = readPreviewDocument(doc, true);
    expect(back).not.toContain("data-wm-preview");
    expect(back).not.toContain("<base");
    expect(back).toContain("<title>Issue 4</title>");
    expect(back).toContain('<body style="margin:0">');
    expect(back.startsWith("<!doctype html>")).toBe(true);
  });

  it("keeps a whole document's head ahead of the preview's defaults", () => {
    // The message's own styles come after the defaults, so they win.
    const page = previewDocument("<html><head><style>p{color:red}</style></head><body><p>x</p></body></html>");
    expect(page.indexOf("data-wm-preview")).toBeLessThan(page.indexOf("p{color:red}"));
  });
});

describe("laying the HTML out to be read", () => {
  const editorOutput = toEmailHtml(
    "<p>Hello <strong>team</strong>,</p><table><tbody><tr><th><p>Speaker</p></th><th><p>City</p></th></tr>" +
      "<tr><td><p>Ali</p></td><td><p></p></td></tr></tbody></table><ul><li><p>One</p></li></ul><pre><code>a\n  b</code></pre>",
  );

  it("puts one element on a line, with what it holds indented", () => {
    const lines = formatHtml(editorOutput).split("\n");
    expect(lines.length).toBeGreaterThan(15);
    expect(lines.find((line) => line.trim().startsWith("<td"))).toMatch(/^ {8}<td/);
    // A paragraph's words stay together, tags and all.
    expect(lines.some((line) => /<p [^>]*>Hello <strong>team<\/strong>,<\/p>$/.test(line.trim()))).toBe(true);
  });

  it("changes nothing a reader would see", () => {
    /*
     * Only whitespace between blocks is added. The text and every element survive, so
     * the message drawn from the laid-out code is the one drawn from the original.
     */
    const formatted = formatHtml(editorOutput);
    expect(htmlToText(formatted)).toBe(htmlToText(editorOutput));
    const before = parse(editorOutput).body;
    const after = parse(formatted).body;
    expect(after.querySelectorAll("*").length).toBe(before.querySelectorAll("*").length);
    expect(after.querySelector("td")?.getAttribute("style")).toBe(before.querySelector("td")?.getAttribute("style"));
  });

  it("leaves a code block's lines exactly as written", () => {
    expect(formatHtml(editorOutput)).toContain("a\n  b</code></pre>");
  });
});
