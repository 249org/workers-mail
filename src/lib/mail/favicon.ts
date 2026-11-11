/*
 * Draws the unread count onto the tab icon.
 *
 * The icon is rasterised rather than composed as SVG: an SVG favicon is still refused by
 * Safari, and a tab icon that only works in some browsers is worse than one drawn into a
 * canvas, which every browser takes as a PNG.
 */

/** Drawn at four times the size a tab shows, so the number survives being scaled down. */
export const ICON_PX = 64;

export type BadgeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fontPx: number;
};

/** Thickness of the gap cut around the badge so it reads against the mark beneath it. */
export const BADGE_RING = 3;

const BADGE_HEIGHT = 44;
const BADGE_INSET = 1;

/*
 * A tab gives the icon about sixteen pixels. A badge drawn over a full-size mark had
 * roughly nine of them to say a number in, which is a red smudge and nothing more, so the
 * mark gives up a little of the frame and sits down in the corner away from the count.
 */
const MARK_SCALE = 0.86;

/**
 * Where the badge sits and how big it is, for a given label.
 *
 * A single digit is a circle. Anything wider — a two-digit count, or the `99+` that
 * stands in for the rest — grows into a pill rather than shrinking the type, because at
 * the sixteen pixels a tab actually gives you, smaller type is just a smudge.
 */
/** Roughly the advance width of bold digits, which is what every label here is made of. */
export function labelWidth(label: string, fontPx: number): number {
  return label.length * fontPx * 0.62;
}

export function badgeBox(label: string, size = ICON_PX): BadgeBox {
  const height = Math.round((BADGE_HEIGHT * size) / ICON_PX);
  const inset = Math.round((BADGE_INSET * size) / ICON_PX);
  const fontPx = label.length > 2 ? Math.round(height * 0.62) : Math.round(height * 0.78);
  const text = labelWidth(label, fontPx);
  const width = Math.min(size - inset * 2, Math.max(height, Math.round(text + fontPx * 0.6)));

  return {
    x: size - inset - width,
    y: inset,
    width,
    height,
    radius: height / 2,
    fontPx,
  };
}

/**
 * Gives an SVG the intrinsic size a canvas needs.
 *
 * The app's mark carries a viewBox and nothing else, which is right for a stylesheet and
 * useless to `drawImage`: with no width or height to read, the browser has no size to
 * draw it at and nothing appears.
 */
export function withExplicitSize(svg: string, px: number): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) return svg;
  const tag = open[0]
    .replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s*\/?>$/, "");
  return `${svg.slice(0, open.index)}${tag} width="${px}" height="${px}">${svg.slice(
    open.index + open[0].length,
  )}`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number; radius: number },
  grow: number,
): void {
  const radius = box.radius + grow;
  const x = box.x - grow;
  const y = box.y - grow;
  const width = box.width + grow * 2;
  const height = box.height + grow * 2;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export type BadgeColors = { badge: string; text: string };

/** Paints the mark, then the badge over its top-right corner. Returns a PNG data URL. */
export function drawBadgedIcon(
  base: CanvasImageSource,
  label: string,
  colors: BadgeColors,
  size = ICON_PX,
): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  const mark = label ? Math.round(size * MARK_SCALE) : size;
  ctx.drawImage(base, 0, size - mark, mark, mark);

  if (label) {
    const box = badgeBox(label, size);
    const ring = Math.round((BADGE_RING * size) / ICON_PX);

    // The ring is cut out of the mark rather than drawn on top of it, so the badge keeps
    // its edge whatever colour the icon happens to be behind it.
    ctx.globalCompositeOperation = "destination-out";
    roundedRect(ctx, box, ring);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = colors.badge;
    roundedRect(ctx, box, 0);
    ctx.fill();

    ctx.fillStyle = colors.text;
    ctx.font = `700 ${box.fontPx}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Digits sit above the geometric middle of a line box; nudge them back onto it.
    ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2 + box.fontPx * 0.04);
  }

  return canvas.toDataURL("image/png");
}

/** Loads an SVG at a URL as an image a canvas can draw. */
export async function loadSvgImage(href: string, px: number): Promise<HTMLImageElement | null> {
  const response = await fetch(href, { cache: "force-cache" });
  if (!response.ok) return null;
  const svg = withExplicitSize(await response.text(), px);

  return new Promise((resolve) => {
    const image = new Image(px, px);
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

const ICON_SELECTOR = 'link[rel="icon"], link[rel="shortcut icon"]';

/** The icon the page was served with, read before anything replaces it. */
export function currentIconHref(): string | null {
  return document.querySelector<HTMLLinkElement>(ICON_SELECTOR)?.href ?? null;
}

/**
 * Swaps the tab icon.
 *
 * The link element is replaced rather than retargeted: Chrome holds on to the icon it
 * first fetched for an element, so changing `href` in place is sometimes ignored and the
 * count stops moving.
 */
export function setIconHref(href: string, type: string): void {
  for (const link of document.querySelectorAll(ICON_SELECTOR)) link.remove();
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = type;
  link.href = href;
  document.head.appendChild(link);
}
