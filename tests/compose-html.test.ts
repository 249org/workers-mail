import { describe, expect, it } from "vitest";
import {
  asHtmlDocument,
  htmlToText,
  previewDocument,
  switchFormat,
  textToHtml,
} from "@/lib/mail/compose-html";

describe("typed text into HTML", () => {
  it("makes paragraphs of blocks and breaks of single lines", () => {
    expect(textToHtml("Hi Ali,\n\nThe deck is attached.\nCall me after.")).toBe(
      "<p>Hi Ali,</p>\n<p>The deck is attached.<br>\nCall me after.</p>",
    );
  });

  it("escapes anything that would otherwise be read as markup", () => {
    /*
     * Someone writing about `<b>` in plain text means the characters, and switching to
     * HTML must not turn their words into formatting — or into a script.
     */
    expect(textToHtml('Use <b> & "quotes"')).toBe("<p>Use &lt;b&gt; &amp; &quot;quotes&quot;</p>");
    expect(textToHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("carries a signature across as written", () => {
    const html = textToHtml("Thanks,\n\n-- \nAyman Idrees\nMENA Speakers");
    expect(html).toContain("<p>-- <br>\nAyman Idrees<br>\nMENA Speakers</p>");
  });

  it("ignores blank space rather than making empty paragraphs", () => {
    expect(textToHtml("\n\n\nHello\n\n\n\n")).toBe("<p>Hello</p>");
    expect(textToHtml("")).toBe("");
  });
});

describe("the plain-text copy of an HTML message", () => {
  it("keeps the words and the shape of the paragraphs", () => {
    expect(htmlToText("<p>Hi Ali,</p><p>The deck is <b>attached</b>.</p>")).toBe(
      "Hi Ali,\n\nThe deck is attached.",
    );
  });

  it("keeps where a link goes, since text has no other way to follow it", () => {
    expect(htmlToText('<p>See <a href="https://example.com/report">the report</a>.</p>')).toBe(
      "See the report (https://example.com/report).",
    );
  });

  it("does not say an address twice when the label already is it", () => {
    expect(htmlToText('<a href="https://example.com">https://example.com</a>')).toBe(
      "https://example.com",
    );
    expect(htmlToText('<a href="mailto:ali@example.com">ali@example.com</a>')).toBe("ali@example.com");
  });

  it("drops a link target that is not somewhere a reader can go", () => {
    // `javascript:` and in-page anchors mean nothing in a text email.
    expect(htmlToText('<a href="javascript:void(0)">Click</a>')).toBe("Click");
    expect(htmlToText('<a href="#top">Top</a>')).toBe("Top");
  });

  it("leaves out what a reader never sees", () => {
    const html =
      "<html><head><title>Newsletter</title><style>p{color:red}</style></head>" +
      "<body><!-- tracking --><p>Hello</p><script>track()</script></body></html>";
    expect(htmlToText(html)).toBe("Hello");
  });

  it("turns list items into bullets and decodes entities", () => {
    expect(htmlToText("<ul><li>Fish &amp; chips</li><li>Tea</li></ul>")).toBe("• Fish & chips\n• Tea");
  });

  it("turns line breaks into line breaks", () => {
    expect(htmlToText("Line one<br>Line two<br/>Line three")).toBe("Line one\nLine two\nLine three");
  });
});

describe("what goes out", () => {
  it("wraps a fragment in the document a mail client expects", () => {
    const doc = asHtmlDocument("<p>Hello</p>");
    expect(doc).toMatch(/^<!doctype html>/);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain("<p>Hello</p>");
  });

  it("leaves a whole document exactly as written", () => {
    const full = '<html><body style="background:#000"><p>Hi</p></body></html>';
    expect(asHtmlDocument(full)).toBe(full);
  });

  it("previews on a white page with links opening outside the frame", () => {
    const doc = previewDocument("<p>Hello</p>");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("background:#fff");
    expect(doc).toContain("<p>Hello</p>");
  });
});

describe("switching between plain text and HTML", () => {
  it("builds HTML from what was typed the first time", () => {
    const moved = switchFormat({ text: "Hello\n\nBye", html: "" }, "html", null);
    expect(moved.html).toBe("<p>Hello</p>\n<p>Bye</p>");
  });

  it("returns to exactly what was there when nothing was touched", () => {
    /*
     * Flipping to text to check how it reads and back again must not flatten the HTML
     * someone wrote by hand into paragraphs.
     */
    const written = '<table><tr><td style="color:red">Sale</td></tr></table>';
    const toText = switchFormat({ text: "", html: written }, "text", null);
    const back = switchFormat({ text: toText.text, html: written }, "html", toText.memo);
    expect(back.html).toBe(written);
  });

  it("carries an edit across by converting it", () => {
    const toHtml = switchFormat({ text: "Hello", html: "" }, "html", null);
    const edited = "<p>Hello <b>there</b></p>";
    const toText = switchFormat({ text: toHtml.text, html: edited }, "text", toHtml.memo);
    expect(toText.text).toBe("Hello there");

    const retyped = switchFormat({ text: "Hello again", html: edited }, "html", toText.memo);
    expect(retyped.html).toBe("<p>Hello again</p>");
  });
});
