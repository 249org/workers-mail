import { decodeEntities } from "./text";

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup", "dd", "div",
  "dl", "dt", "em", "figcaption", "figure", "font", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  "i", "img", "li", "ol", "p", "pre", "q", "s", "small", "span", "strike", "strong", "sub",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);

const ALLOWED_ATTRS = new Set([
  "abbr", "align", "alt", "axis", "background", "bgcolor", "border", "bordercolor",
  "cellpadding", "cellspacing", "color", "colspan", "dir", "face", "headers", "height",
  "href", "hspace", "lang", "nowrap", "rowspan", "scope", "size", "src", "start", "style",
  "title", "type", "valign", "vspace", "width",
]);

const ALLOWED_STYLE = new Set([
  "background", "background-color", "background-image", "background-position",
  "background-repeat", "background-size", "border", "border-bottom", "border-collapse",
  "border-color", "border-left", "border-radius", "border-right", "border-spacing",
  "border-style", "border-top", "border-width", "box-sizing", "color", "display",
  "font", "font-family", "font-size", "font-style", "font-weight", "height", "letter-spacing",
  "line-height", "list-style", "list-style-type", "margin", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "max-height", "max-width", "min-height", "min-width",
  "opacity", "overflow", "overflow-wrap", "overflow-x", "overflow-y", "padding",
  "padding-bottom", "padding-left", "padding-right", "padding-top", "table-layout",
  "text-align", "text-decoration", "text-transform", "vertical-align", "white-space",
  "width", "word-break", "word-spacing",
]);

const VOID_TAGS = new Set(["br", "hr", "img", "col"]);
const BLOCKED_CONTENT = /<(script|style|head|title|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const CONTROL_CHARS = /[\u0000-\u0020\u007f]/g;

export type SanitizeResult = {
  html: string;
  blockedImages: number;
};

export type InlineImage = {
  id: string;
  contentId?: string | null;
  filename: string;
};

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const DATA_IMAGE_MAX = 250_000;

/**
 * Maps Content-ID / filename keys onto same-origin attachment URLs so `cid:`
 * images in HTML can actually load. Keys are lowercased and stripped of `<>`.
 */
export function inlineSrcMap(files: InlineImage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const url = `/api/attachments/${file.id}`;
    if (file.contentId) {
      const cid = normalizeCid(file.contentId);
      map.set(cid, url);
      const local = cid.split("@")[0];
      if (local) map.set(local, url);
    }
    map.set(file.filename.toLowerCase(), url);
  }
  return map;
}

export function normalizeCid(value: string): string {
  let text = value.trim().replace(/^cid:/i, "");
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep the raw value when it is not percent-encoded */
  }
  return text.replace(/^</, "").replace(/>$/, "").trim().toLowerCase();
}

/**
 * Allow-list sanitiser for rendered message bodies. It runs in the Worker isolate, so it
 * cannot lean on a DOM. Remote images are replaced with a sized spacer until the reader
 * opts in. `cid:` sources are rewritten to attachment URLs. Presentational attributes
 * and a narrow style allow-list are kept so HTML newsletters still look like themselves.
 */
export function sanitizeMessageHtml(
  input: string,
  allowRemoteImages: boolean,
  inlineImages: Map<string, string> = new Map(),
): SanitizeResult {
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

      const result = filterAttributes(tag, rawAttrs, allowRemoteImages, inlineImages);
      if (!result) return "";
      if (result.remoteBlocked) blockedImages += 1;
      return `<${tag}${result.attrs}${VOID_TAGS.has(tag) ? " />" : ">"}`;
    },
  );

  return { html, blockedImages };
}

function filterAttributes(
  tag: string,
  rawAttrs: string,
  allowRemoteImages: boolean,
  inlineImages: Map<string, string>,
): { attrs: string; remoteBlocked: boolean } | null {
  const kept: string[] = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let remoteBlocked = false;
  let width = "";
  let height = "";

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
      if (tag !== "img") return null;
      const resolved = resolveImageSrc(value, allowRemoteImages, inlineImages);
      if (resolved === "remote-blocked") {
        remoteBlocked = true;
        continue;
      }
      if (resolved === null) return null;
      kept.push(`src="${escapeAttr(resolved)}"`);
      continue;
    }

    if (name === "background") {
      const resolved = resolveImageSrc(value, allowRemoteImages, inlineImages);
      if (resolved === "remote-blocked") {
        remoteBlocked = true;
        continue;
      }
      if (!resolved) continue;
      kept.push(`background="${escapeAttr(resolved)}"`);
      continue;
    }

    if (name === "style") {
      /*
       * Entities are decoded before the declarations are split, because `&quot;` carries
       * a semicolon. Word writes `font-family:&quot;Calibri&quot;,sans-serif` and reading
       * that literally cut the list into fragments, losing the font and everything after
       * it — enough of a metrics change to wrap the fixed-width cells of a signature.
       */
      const style = sanitizeStyle(decodeEntities(value), allowRemoteImages, inlineImages);
      if (style) kept.push(`style="${escapeAttr(style)}"`);
      continue;
    }

    if (name === "width") width = value;
    if (name === "height") height = value;
    kept.push(`${name}="${escapeAttr(value)}"`);
  }

  if (remoteBlocked && tag === "img") {
    kept.push(`src="${spacerSrc(width, height)}"`);
    kept.push('data-blocked=""');
  }

  if (remoteBlocked && tag !== "img" && kept.length === 0) return null;
  return { attrs: kept.length ? ` ${kept.join(" ")}` : "", remoteBlocked };
}

function resolveImageSrc(
  value: string,
  allowRemoteImages: boolean,
  inlineImages: Map<string, string>,
): string | null | "remote-blocked" {
  const trimmed = value.replace(CONTROL_CHARS, "").trim();

  if (/^cid:/i.test(trimmed)) {
    return lookupCid(trimmed, inlineImages);
  }

  if (DATA_IMAGE.test(trimmed) && trimmed.length <= DATA_IMAGE_MAX) {
    return trimmed.replace(/\s+/g, "");
  }

  if (trimmed.startsWith("//")) {
    return allowRemoteImages ? `https:${trimmed}` : "remote-blocked";
  }

  if (/^https?:/i.test(trimmed)) {
    return allowRemoteImages ? trimmed : "remote-blocked";
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return null;
}

function lookupCid(value: string, inlineImages: Map<string, string>): string | null {
  const cid = normalizeCid(value);
  return inlineImages.get(cid) ?? inlineImages.get(cid.split("@")[0] ?? "") ?? null;
}

function spacerSrc(width: string, height: string): string {
  const w = clampDim(width, 1);
  const h = clampDim(height, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function clampDim(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 2400);
}

function sanitizeStyle(
  style: string,
  allowRemoteImages: boolean,
  inlineImages: Map<string, string>,
): string {
  const kept: string[] = [];
  for (const raw of style.split(";")) {
    const idx = raw.indexOf(":");
    if (idx < 0) continue;
    const prop = raw.slice(0, idx).trim().toLowerCase();
    if (!ALLOWED_STYLE.has(prop) || prop.includes("\\")) continue;
    let value = raw.slice(idx + 1).trim();
    if (!value) continue;
    if (/expression|javascript:|vbscript:|behavior|-moz-binding|@import/i.test(value)) continue;
    const withUrls = rewriteCssUrls(value, allowRemoteImages, inlineImages);
    if (!withUrls) continue;
    kept.push(`${prop}: ${withUrls}`);
  }
  return kept.join("; ");
}

function rewriteCssUrls(
  value: string,
  allowRemoteImages: boolean,
  inlineImages: Map<string, string>,
): string | null {
  if (!/url\s*\(/i.test(value)) return value;
  let blocked = false;
  const rewritten = value.replace(
    /url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (_full, _q: string, url: string) => {
      const resolved = resolveImageSrc(url.trim(), allowRemoteImages, inlineImages);
      if (!resolved || resolved === "remote-blocked") {
        blocked = true;
        return "";
      }
      return `url("${resolved}")`;
    },
  );
  const cleaned = rewritten.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "," || /^[\/,\s]*$/.test(cleaned)) return blocked ? null : cleaned;
  return cleaned;
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.replace(CONTROL_CHARS, "");
  if (/^(https?|mailto):/i.test(trimmed)) return true;
  if (trimmed.startsWith("//")) return false;
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
    .map((block) => formatPlainBlock(block))
    .join("");
}

/** All-caps lines such as CALLS TODAY become section titles, not body shouting. */
function isSectionHeading(line: string): boolean {
  const text = line.replace(/<[^>]+>/g, "").trim();
  if (text.length < 3 || text.length > 72) return false;
  if (!/\s/.test(text)) return false;
  if ((text.match(/\d/g) ?? []).length > 2) return false;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

function formatPlainBlock(block: string): string {
  const out: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    out.push(`<p>${buffer.join("<br />")}</p>`);
    buffer = [];
  };

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (/^[-*=_]{3,}$/.test(trimmed)) {
      flush();
      out.push("<hr />");
      continue;
    }
    if (isSectionHeading(line)) {
      flush();
      out.push(`<h2>${trimmed}</h2>`);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out.join("");
}
