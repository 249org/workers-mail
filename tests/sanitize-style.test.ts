import { describe, expect, it } from "vitest";
import { sanitizeMessageHtml } from "@/lib/mail/sanitize";

function styleOf(html: string): string {
  return /style="([^"]*)"/.exec(sanitizeMessageHtml(html, false, new Map()).html)?.[1] ?? "";
}

describe("style attributes carrying entities", () => {
  it("keeps a font name written as &quot;, and everything after it", () => {
    /*
     * Word writes `font-family:&quot;Calibri&quot;,sans-serif`. The entity carries a
     * semicolon, so reading the attribute literally split the declaration list on it —
     * the font was lost along with every rule that followed, which changed the text
     * metrics enough to wrap the fixed-width cells of a signature.
     */
    const style = styleOf(
      `<span style="font-family:&quot;Calibri&quot;,sans-serif;color:white;font-size:10.0pt">Tel</span>`,
    );
    expect(style).toContain("Calibri");
    expect(style).toContain("sans-serif");
    expect(style).toContain("color: white");
    expect(style).toContain("font-size: 10.0pt");
    expect(style).not.toContain("&amp;quot");
  });

  it("keeps the same style however the sender quoted it", () => {
    const single = styleOf(
      `<span style='font-family:"Calibri",sans-serif;color:white'>Tel</span>`,
    );
    const entity = styleOf(
      `<span style="font-family:&quot;Calibri&quot;,sans-serif;color:white">Tel</span>`,
    );
    expect(single).toContain("Calibri");
    expect(entity).toContain("Calibri");
    expect(single).toBe(entity);
  });

  it("handles other entities in a declaration", () => {
    expect(styleOf(`<span style="color:red&#59;font-weight:bold">x</span>`)).toContain(
      "font-weight: bold",
    );
  });

  it("still drops what is not allowed", () => {
    expect(styleOf(`<span style="position:fixed;color:red">x</span>`)).toBe("color: red");
    expect(styleOf(`<span style="width:expression(alert(1));color:red">x</span>`)).toBe(
      "color: red",
    );
  });

  it("leaves a style with no entities untouched", () => {
    expect(styleOf(`<span style="color:#333;font-size:11pt">x</span>`)).toBe(
      "color: #333; font-size: 11pt",
    );
  });
});
