import { decodeEntities } from "./text";

/*
 * Writing a message as HTML: turning what has been typed into one form or the other, and
 * the plain-text copy that travels beside the HTML. Spam filters mark down a message
 * that is HTML alone, and some people read mail as text, so both always go.
 */

/** Plain text, the rich editor, or HTML written by hand. The last two both send `html`. */
export type BodyFormat = "text" | "rich" | "html";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Typed text as HTML to carry on editing: blank lines become paragraphs, single ones
 * break, and the `> ` lines a reply quotes the original with become a quote block.
 */
export function textToHtml(text: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let quoted: string[] = [];

  const endParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(escapeHtml).join("<br>\n")}</p>`);
    paragraph = [];
  };
  const endQuote = () => {
    if (quoted.length) out.push(`<blockquote>${textToHtml(quoted.join("\n"))}</blockquote>`);
    quoted = [];
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      endParagraph();
      quoted.push(quote[1] ?? "");
      continue;
    }
    endQuote();
    if (line.trim()) paragraph.push(line);
    else endParagraph();
  }
  endParagraph();
  endQuote();
  // A reply starts with blank lines above the quote: the place to write the answer.
  if (out.length && /^\s*\n/.test(text)) out.unshift("<p></p>");
  return out.join("\n");
}

/**
 * The plain-text copy of an HTML message.
 *
 * A link keeps its address — "the report (https://…)" — because in plain text the
 * address is the only way to follow it. Where the label already is the address it is
 * not said twice.
 */
export function htmlToText(html: string): string {
  // Code blocks are set aside so the tidying below cannot flatten their indentation.
  const blocks: string[] = [];
  const held = collapseWhitespace(html).replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
    blocks.push(decodeEntities(inner.replace(/<[^>]+>/g, "")));
    return `\n\n\u0000${blocks.length - 1}\u0000\n\n`;
  });

  const text = held
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
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/\u0000(\d+)\u0000/g, (_, index: string) => blocks[Number(index)] ?? "");
}

/*
 * Line breaks and indentation in the source are layout for whoever reads the code, not
 * the message: HTML draws them as a single space. Left in, an indented newsletter's
 * plain-text copy broke mid-sentence wherever its source did. A code block is the
 * exception — its lines are the content.
 */
function collapseWhitespace(html: string): string {
  return html
    .split(/(<pre\b[\s\S]*?<\/pre>)/i)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\s+/g, " ")))
    .join("");
}

/** A fragment gets the document around it a mail client expects; a whole document is left as written. */
export function asHtmlDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n${html}\n</body>\n</html>`;
}

/*
 * The preview is the message on the white page most mail clients give it, whatever the
 * app's own theme, with links opening in a new tab rather than inside the frame. What
 * is added for that is marked, so an edited preview can be read back without it.
 */
const PREVIEW_MARK = "data-wm-preview";
const PREVIEW_DEFAULTS =
  `<meta charset="utf-8" ${PREVIEW_MARK}><base target="_blank" ${PREVIEW_MARK}>` +
  `<style ${PREVIEW_MARK}>html{background:#fff;color:#1f2328;` +
  "font:14px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Helvetica,Arial,sans-serif}" +
  "body{margin:16px}img{max-width:100%}</style>";

export function isFullDocument(html: string): boolean {
  return /<html[\s>]/i.test(html);
}

/**
 * The page the preview shows. A whole document keeps its own head and body, with the
 * defaults slipped in first so anything it says for itself still wins.
 */
export function previewDocument(html: string): string {
  if (!isFullDocument(html)) {
    return `<!doctype html><html><head>${PREVIEW_DEFAULTS}</head><body>${html}</body></html>`;
  }
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${PREVIEW_DEFAULTS}`);
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${PREVIEW_DEFAULTS}</head>`);
}

/**
 * The message as it stands after being edited in the preview: the preview's own
 * additions taken back out, and a fragment returned as a fragment, so what was written
 * as a few paragraphs does not come back as a whole document.
 */
export function readPreviewDocument(doc: Document, fullDocument: boolean): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  for (const added of Array.from(root.querySelectorAll(`[${PREVIEW_MARK}]`))) added.remove();
  const body = root.querySelector("body");
  if (!fullDocument) return body?.innerHTML ?? "";
  const doctype = doc.doctype ? `<!doctype ${doc.doctype.name}>\n` : "";
  return `${doctype}${root.outerHTML}`;
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
  if (to !== "text") {
    const untouched = memo && memo.text === current.text && memo.html;
    const html = untouched ? memo.html : textToHtml(current.text);
    return { text: current.text, html, memo: { text: current.text, html } };
  }
  const untouched = memo && memo.html === current.html && memo.text;
  const text = untouched ? memo.text : htmlToText(current.html);
  return { text, html: current.html, memo: { text, html: current.html } };
}

/**
 * What was typed into a link field, as an address a link can carry: a bare domain gets
 * https, an email address gets mailto, and anything that is neither is refused rather
 * than turned into a link to nowhere.
 */
export function normalizeLink(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/^(https?:|mailto:|tel:)/i.test(text)) return text;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(text)) return `mailto:${text}`;
  if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) return `https://${text}`;
  return null;
}

/* Elements that hold other blocks, set out one per line with what they hold indented. */
const CONTAINERS = new Set([
  "html", "head", "body", "div", "table", "colgroup", "thead", "tbody", "tfoot", "tr", "td", "th",
  "ul", "ol", "li", "blockquote",
]);
/* Blocks of words, each kept whole on its own line. */
const LINES = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "title", "style"]);
/* Blocks with nothing inside. */
const STANDALONE = new Set(["col", "hr", "meta", "link", "base"]);

/**
 * HTML laid out to be read: an element per line, nesting indented, the words of a
 * paragraph left together. Only whitespace between blocks is added, so what a client
 * draws is unchanged — the rich editor's output arrived as one unbroken line, which
 * nobody could edit.
 */
export function formatHtml(html: string): string {
  const out: string[] = [];
  let depth = 0;
  let line = "";
  let verbatim = false;

  const indent = () => "  ".repeat(depth);
  const flush = () => {
    const text = verbatim ? line : line.trim();
    if (text) out.push(indent() + text);
    line = "";
  };

  for (const token of html.split(/(<[^>]+>)/)) {
    if (!token) continue;
    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
    const name = tag?.[2]?.toLowerCase() ?? "";
    const closing = tag?.[1] === "/";

    if (verbatim) {
      line += token;
      if (closing && name === "pre") {
        flush();
        verbatim = false;
      }
      continue;
    }
    if (!tag) {
      line += token.replace(/\s*\n\s*/g, " ");
      continue;
    }
    if (CONTAINERS.has(name)) {
      flush();
      if (closing) depth = Math.max(0, depth - 1);
      out.push(indent() + token);
      if (!closing) depth += 1;
    } else if (LINES.has(name)) {
      if (closing) {
        line += token;
        flush();
      } else {
        flush();
        line = token;
        verbatim = name === "pre";
      }
    } else if (STANDALONE.has(name) || /^<!doctype/i.test(token)) {
      flush();
      out.push(indent() + token);
    } else {
      line += token;
    }
  }
  flush();
  return out.join("\n");
}
