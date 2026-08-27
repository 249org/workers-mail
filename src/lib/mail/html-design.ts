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

/** Backgrounds are decisive on their own: they are the thing a dark reader cannot honour. */
const BACKGROUND = /(?:\bbgcolor\s*=|\bbackground\s*=|background(?:-color)?\s*:)/i;

const TABLE = /<table\b/gi;
const IMAGE = /<img\b[^>]*>/gi;

/** A pixel that exists to report a read is not evidence of design. */
const TRACKING_PIXEL = /(?:width|height)\s*=\s*["']?[0-3]["']?[\s/>]/i;

/** Layout tables and picture-led designs both come in multiples; one of either does not. */
const LAYOUT_TABLES = 2;
const DESIGN_IMAGES = 2;

export function htmlCarriesOwnDesign(html: string): boolean {
  if (!html) return false;
  if (BACKGROUND.test(html)) return true;

  if (countMatches(html, TABLE) >= LAYOUT_TABLES) return true;

  const images = (html.match(IMAGE) ?? []).filter((tag) => !TRACKING_PIXEL.test(tag));
  return images.length >= DESIGN_IMAGES;
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) ?? []).length;
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
