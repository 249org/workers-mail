/*
 * A picture dropped into the editor lives in the document as a data: URL. Gmail and
 * Outlook both refuse to show those, so a message sent that way arrives with empty boxes
 * where the pictures were. Before sending, each one is lifted out into an attachment of
 * its own and the image points at it by Content-ID — the way mail has always embedded
 * pictures, and the way every client expects.
 */

export type InlineImage = {
  contentId: string;
  mimeType: string;
  filename: string;
  contentBase64: string;
};

const DATA_IMAGE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)\2/gi;

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Moves every embedded picture into an attachment. The same picture pasted twice goes
 * once, with both places pointing at it.
 */
export function extractInlineImages(
  html: string,
  newId: () => string = randomId,
): { html: string; images: InlineImage[] } {
  const images: InlineImage[] = [];
  const seen = new Map<string, string>();

  const rewritten = html.replace(DATA_IMAGE, (_, opening: string, quote: string, type: string, data: string) => {
    const mimeType = type.toLowerCase() === "image/jpg" ? "image/jpeg" : type.toLowerCase();
    const contentBase64 = data.replace(/\s+/g, "");
    const key = `${mimeType}:${contentBase64}`;
    let contentId = seen.get(key);
    if (!contentId) {
      contentId = `image-${images.length + 1}.${newId()}@workers-mail`;
      seen.set(key, contentId);
      images.push({
        contentId,
        mimeType,
        filename: `image-${images.length + 1}.${EXTENSION[mimeType] ?? "img"}`,
        contentBase64,
      });
    }
    return `${opening}${quote}cid:${contentId}${quote}`;
  });

  return { html: rewritten, images };
}

/** Bytes a base64 string decodes to, for checking a message against the size limit. */
export function base64Bytes(value: string): number {
  const clean = value.replace(/\s+/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}
