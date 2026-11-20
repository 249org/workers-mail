import { decodeEntities } from "./text";

/*
 * Writing a message as HTML: turning what has been typed into one form or the other, and
 * the plain-text copy that travels beside the HTML. Spam filters mark down a message
 * that is HTML alone, and some people read mail as text, so both always go.
 */

export type BodyFormat = "text" | "html";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Typed text as HTML to carry on editing: blank lines become paragraphs, the rest breaks. */
export function textToHtml(text: string): string {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return blocks
    .filter((block) => block.trim())
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>\n")}</p>`)
    .join("\n");
}

/**
 * The plain-text copy of an HTML message.
 *
 * A link keeps its address — "the report (https://…)" — because in plain text the
 * address is the only way to follow it. Where the label already is the address it is
 * not said twice.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|script|style|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _q, href: string, label: string) => {
      const shown = label.replace(/<[^>]+>/g, "").trim();
      const target = decodeEntities(href.trim());
      if (!/^(https?:|mailto:)/i.test(target)) return shown;
      const bare = target.replace(/^mailto:/i, "");
      return !shown || decodeEntities(shown) === bare || decodeEntities(shown) === target
        ? bare
        : `${shown} (${bare})`;
    })
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|blockquote|table|ul|ol)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A fragment gets the document around it a mail client expects; a whole document is left as written. */
export function asHtmlDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n${html}\n</body>\n</html>`;
}

/*
 * The preview is the message on the white page most mail clients give it, whatever the
 * app's own theme, with links opening in a new tab rather than inside the frame.
 */
const PREVIEW_DEFAULTS =
  '<base target="_blank"><style>html{background:#fff;color:#1f2328;' +
  "font:14px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Helvetica,Arial,sans-serif}" +
  "body{margin:16px}img{max-width:100%}</style>";

export function previewDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${PREVIEW_DEFAULTS}</head><body>${html}</body></html>`;
}

export type FormatMemo = { text: string; html: string } | null;

/**
 * Moves the body to the other format.
 *
 * Flipping back and forth without touching anything lands on exactly what was there —
 * the hand-written HTML is not flattened and rebuilt. Only an edit made since the last
 * switch is carried across, by converting it.
 */
export function switchFormat(
  current: { text: string; html: string },
  to: BodyFormat,
  memo: FormatMemo,
): { text: string; html: string; memo: FormatMemo } {
  if (to === "html") {
    const untouched = memo && memo.text === current.text && memo.html;
    const html = untouched ? memo.html : textToHtml(current.text);
    return { text: current.text, html, memo: { text: current.text, html } };
  }
  const untouched = memo && memo.html === current.html && memo.text;
  const text = untouched ? memo.text : htmlToText(current.html);
  return { text, html: current.html, memo: { text, html: current.html } };
}
