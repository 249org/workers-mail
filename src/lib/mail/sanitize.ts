const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "dd", "div", "dl", "dt",
  "em", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li",
  "ol", "p", "pre", "q", "s", "small", "span", "strike", "strong", "sub", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "width", "height", "align", "colspan", "rowspan",
]);

const VOID_TAGS = new Set(["br", "hr", "img", "col"]);
const BLOCKED_CONTENT = /<(script|style|head|title|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const CONTROL_CHARS = /[\u0000-\u0020\u007f]/g;

export type SanitizeResult = {
  html: string;
  blockedImages: number;
};

/**
 * Allow-list sanitiser for rendered message bodies. It runs in the Worker isolate, so it
 * cannot lean on a DOM. Remote images are dropped until the reader opts in, which also
 * stops tracking pixels firing on open.
 */
export function sanitizeMessageHtml(input: string, allowRemoteImages: boolean): SanitizeResult {
  let blockedImages = 0;

  const stripped = input
    .replace(BLOCKED_CONTENT, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  const html = stripped.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>/g,
    (match, rawName: string, rawAttrs: string) => {
      const tag = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (match.startsWith("</")) return `</${tag}>`;

      const attrs = filterAttributes(tag, rawAttrs, allowRemoteImages);
      if (attrs === null) {
        if (tag === "img") blockedImages += 1;
        return "";
      }
      return `<${tag}${attrs}${VOID_TAGS.has(tag) ? " />" : ">"}`;
    },
  );

  return { html, blockedImages };
}

function filterAttributes(
  tag: string,
  rawAttrs: string,
  allowRemoteImages: boolean,
): string | null {
  const kept: string[] = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  for (const match of rawAttrs.matchAll(pattern)) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (!ALLOWED_ATTRS.has(name)) continue;

    if (name === "href") {
      if (!isSafeUrl(value)) continue;
      kept.push(`href="${escapeAttr(value)}" target="_blank" rel="noreferrer noopener"`);
      continue;
    }

    if (name === "src") {
      if (tag !== "img" || !isSafeUrl(value)) return null;
      if (/^https?:/i.test(value) && !allowRemoteImages) return null;
      kept.push(`src="${escapeAttr(value)}"`);
      continue;
    }

    kept.push(`${name}="${escapeAttr(value)}"`);
  }

  return kept.length ? ` ${kept.join(" ")}` : "";
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.replace(CONTROL_CHARS, "");
  if (/^(https?|mailto|cid):/i.test(trimmed)) return true;
  return trimmed.startsWith("/") || trimmed.startsWith("#");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextToHtml(value: string): string {
  const linked = escapeHtml(value).replace(
    /\b(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>',
  );
  return linked
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}
