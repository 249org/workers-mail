/*
 * Almost every client sends multipart/alternative, so the presence of an HTML part says
 * nothing about whether a message was designed. A note typed in Gmail arrives as HTML
 * exactly like a marketing newsletter does, and treating both as designed put ordinary
 * correspondence on a white sheet in the middle of a dark reader.
 *
 * What separates them is whether the markup carries a look of its own. A newsletter
 * paints its own background, lays itself out in tables and leans on images; a typed note
 * is text in a few divs. The first has to be shown as it was built, because the app has
 * no way to restyle it without wrecking it. The second is better off in the reader's
 * own theme.
 */

/*
 * A background is decisive — it is the thing a dark reader cannot honour — but only when
 * it is actually a colour. Outlook stamps `background-color: rgb(255,255,255)` on plain
 * correspondence, and white is not a design, it is the absence of one.
 */
const BG_ATTRIBUTE = /\bbgcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const BG_STYLE = /background(?:-color)?\s*:\s*([^;"'}]+)/gi;
/** `background="tile.png"` and `background: url(...)` are images, not colours. */
const BG_IMAGE = /\bbackground\s*=\s*["']?[^"'\s>]+|background[^;:]*:\s*[^;"'}]*url\(/i;

const NEUTRAL = new Set([
  "#fff",
  "#ffffff",
  "white",
  "transparent",
  "none",
  "inherit",
  "initial",
  "unset",
  "revert",
  "currentcolor",
]);

/** True for white, transparent, or anything that defers to what is underneath. */
function isNeutralBackground(value: string): boolean {
  const text = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return true;
  if (NEUTRAL.has(text)) return true;
  const rgb = /^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(text);
  if (rgb) {
    // Fully transparent is nothing at all; otherwise only pure white is neutral.
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return true;
    return rgb[1] === "255" && rgb[2] === "255" && rgb[3] === "255";
  }
  return false;
}

function paintsItsOwnBackground(html: string): boolean {
  if (BG_IMAGE.test(html)) return true;

  for (const match of html.matchAll(BG_ATTRIBUTE)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isNeutralBackground(value)) return true;
  }
  for (const match of html.matchAll(BG_STYLE)) {
    if (!isNeutralBackground(match[1] ?? "")) return true;
  }
  return false;
}

const IMAGE = /<img\b[^>]*>/gi;

/** A pixel that exists to report a read is not evidence of design. */
const TRACKING_PIXEL = /(?:width|height)\s*=\s*["']?[0-3]["']?[\s/>]/i;

/*
 * One picture is a signature logo. Several is a message built around them — and the
 * count deliberately excludes tables, which prove nothing either way: Word wraps quoted
 * replies in dozens of them, and a thread that had collected eighteen was being shown on
 * a white sheet on the strength of markup nobody chose.
 */
const DESIGN_IMAGES = 2;

export function htmlCarriesOwnDesign(html: string): boolean {
  if (!html) return false;
  if (paintsItsOwnBackground(html)) return true;

  const images = (html.match(IMAGE) ?? []).filter((tag) => !TRACKING_PIXEL.test(tag));
  return images.length >= DESIGN_IMAGES;
}

export type BodyKind = "plain" | "simple" | "html";

/**
 * `plain` is text with markup generated for it, `html` is a message that owns its
 * presentation, and `simple` is the common middle: real HTML with nothing to preserve.
 */
export function bodyKindFor(hasHtmlPart: boolean, sanitized: string): BodyKind {
  if (!hasHtmlPart) return "plain";
  return htmlCarriesOwnDesign(sanitized) ? "html" : "simple";
}
