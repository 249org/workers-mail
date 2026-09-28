type Listable = {
  id: string;
  inline: boolean;
  contentId: string | null;
};

/** Every `cid:` the sanitiser resolved has become the URL that serves that file. */
const EMBEDDED = /\/api\/attachments\/([A-Za-z0-9_-]+)/g;

/**
 * The files worth listing under a message: the ones its body does not already show.
 *
 * Carrying a Content-Id looks like it should settle this and does not. Gmail stamps one
 * on every part it sends, attachments included, so reading that as "embedded" hid real
 * files — two PDFs on a forwarded message, among others. What the body does with a part
 * is the only reliable answer, and by this point the body says so plainly: anything it
 * embeds has had its `cid:` rewritten to a URL naming the attachment.
 */
export function listedAttachments<T extends Listable>(files: T[], bodyHtml: string): T[] {
  const embedded = new Set<string>();
  for (const match of bodyHtml.matchAll(EMBEDDED)) {
    if (match[1]) embedded.add(match[1]);
  }
  return files.filter((file) => !file.inline && !embedded.has(file.id));
}
