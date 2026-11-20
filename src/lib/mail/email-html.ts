/*
 * The rich editor writes clean markup and leaves the look to its stylesheet. Mail
 * clients throw stylesheets away — Gmail keeps some, Outlook almost none — so before a
 * message goes, every element is given its look as an inline style. A table with no
 * inline border arrives as a grid of floating words.
 *
 * Nothing already on an element is overridden: a colour or an alignment chosen in the
 * editor is itself an inline style, and it wins.
 */

// Single quotes inside: the value is written into a double-quoted style attribute.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "Menlo,Consolas,monospace";
const LINE = "#d0d7de";
const WASH = "#f6f8fa";

/** The body every client gets, whatever its own default type. */
export const BODY_STYLE = `font-family:${FONT};font-size:14px;line-height:1.5;color:#1f2328`;

const STYLES: Record<string, string> = {
  p: "margin:0 0 12px",
  h1: "margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:700",
  h2: "margin:0 0 10px;font-size:21px;line-height:1.3;font-weight:700",
  h3: "margin:0 0 8px;font-size:17px;line-height:1.35;font-weight:700",
  ul: "margin:0 0 12px;padding-left:24px",
  ol: "margin:0 0 12px;padding-left:24px",
  li: "margin:0 0 4px",
  blockquote: `margin:0 0 12px;padding:0 0 0 12px;border-left:3px solid ${LINE};color:#57606a`,
  pre: `margin:0 0 12px;padding:12px;background:${WASH};border-radius:6px;font-family:${MONO};font-size:13px;white-space:pre-wrap`,
  code: `padding:1px 4px;background:${WASH};border-radius:4px;font-family:${MONO};font-size:90%`,
  hr: `border:0;border-top:1px solid ${LINE};margin:16px 0`,
  img: "max-width:100%;height:auto",
  table: "border-collapse:collapse;width:100%;margin:0 0 12px",
  th: `border:1px solid ${LINE};padding:6px 10px;vertical-align:top;text-align:left;background:${WASH};font-weight:600`,
  td: `border:1px solid ${LINE};padding:6px 10px;vertical-align:top`,
  a: "color:#0969da",
};

/** Containers whose last paragraph should not push the box open with its margin. */
const SNUG = new Set(["TD", "TH", "LI", "BLOCKQUOTE"]);

function parseStyle(value: string | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (value ?? "").split(";")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    const property = part.slice(0, at).trim().toLowerCase();
    const setting = part.slice(at + 1).trim();
    if (property && setting) map.set(property, setting);
  }
  return map;
}

function writeStyle(map: Map<string, string>): string {
  return [...map].map(([property, setting]) => `${property}:${setting}`).join(";");
}

/** Adds what is missing; anything the element already says stays as it is. */
function addDefaults(element: Element, defaults: string): void {
  const current = parseStyle(element.getAttribute("style"));
  for (const [property, setting] of parseStyle(defaults)) {
    if (!current.has(property)) current.set(property, setting);
  }
  element.setAttribute("style", writeStyle(current));
}

function setProperty(element: Element, property: string, setting: string): void {
  const current = parseStyle(element.getAttribute("style"));
  current.set(property, setting);
  element.setAttribute("style", writeStyle(current));
}

/** True when the fragment is already one body wrapper, so a second pass does not nest another. */
function alreadyWrapped(body: HTMLElement): boolean {
  const only = body.children.length === 1 ? body.firstElementChild : null;
  return Boolean(
    only &&
      only.tagName === "DIV" &&
      only.getAttribute("style") === BODY_STYLE &&
      body.textContent?.trim() === only.textContent?.trim(),
  );
}

/**
 * The editor's markup, made to look the same in a mail client as it did in the editor.
 * Safe to run on its own output: a second pass changes nothing.
 */
export function toEmailHtml(fragment: string, parser: DOMParser = new DOMParser()): string {
  const doc = parser.parseFromString(`<!doctype html><html><body>${fragment}</body></html>`, "text/html");
  const body = doc.body;

  for (const element of Array.from(body.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    // Code inside a code block takes the block's look, not a second chip of its own.
    if (tag === "code" && element.parentElement?.tagName === "PRE") continue;
    const defaults = STYLES[tag];
    if (defaults) addDefaults(element, defaults);
  }

  for (const element of Array.from(body.querySelectorAll("p, ul, ol, pre, blockquote"))) {
    const parent = element.parentElement;
    if (!parent || !SNUG.has(parent.tagName)) continue;
    if (parent.lastElementChild === element) setProperty(element, "margin-bottom", "0");
    // A list item is one paragraph in the editor; it should read as one line in the mail.
    if (parent.tagName === "LI" && element.tagName === "P") setProperty(element, "margin-top", "0");
  }

  if (alreadyWrapped(body)) return body.innerHTML;
  return `<div style="${BODY_STYLE}">${body.innerHTML}</div>`;
}
