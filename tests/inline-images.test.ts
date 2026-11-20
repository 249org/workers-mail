import { describe, expect, it } from "vitest";
import { base64Bytes, extractInlineImages } from "@/lib/mail/inline-images";
import { normalizeLink, textToHtml } from "@/lib/mail/compose-html";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("pictures in the message", () => {
  it("moves an embedded picture into an attachment the HTML points at", () => {
    /*
     * Gmail and Outlook will not show a data: picture; the box arrives empty. A cid:
     * reference to an attachment is what every client expects.
     */
    let n = 0;
    const { html, images } = extractInlineImages(
      `<p>Logo</p><img src="data:image/png;base64,${PNG}" alt="logo">`,
      () => `id${++n}`,
    );
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ mimeType: "image/png", filename: "image-1.png", contentBase64: PNG });
    expect(html).toBe(`<p>Logo</p><img src="cid:${images[0]?.contentId}" alt="logo">`);
    expect(html).not.toContain("data:");
  });

  it("sends a picture used twice once", () => {
    const tag = `<img src="data:image/png;base64,${PNG}">`;
    const { html, images } = extractInlineImages(`${tag}<p>and again</p>${tag}`, () => "x");
    expect(images).toHaveLength(1);
    expect(html.match(/cid:/g)).toHaveLength(2);
  });

  it("names the type a client understands", () => {
    const { images } = extractInlineImages(`<img src='data:image/jpg;base64,${PNG}'>`, () => "y");
    expect(images[0]?.mimeType).toBe("image/jpeg");
    expect(images[0]?.filename).toBe("image-1.jpg");
  });

  it("gives every picture a Content-ID a MIME header can carry", () => {
    // The server refuses anything outside these characters, so the client must not make one.
    const { images } = extractInlineImages(`<img src="data:image/png;base64,${PNG}">`);
    expect(images[0]?.contentId).toMatch(/^[A-Za-z0-9._@-]{1,120}$/);
  });

  it("leaves a picture on the web where it is", () => {
    const html = '<img src="https://example.com/banner.png">';
    expect(extractInlineImages(html)).toEqual({ html, images: [] });
  });

  it("will not take anything but a picture", () => {
    const html = '<img src="data:text/html;base64,PHNjcmlwdD4=">';
    expect(extractInlineImages(html).images).toHaveLength(0);
  });

  it("counts a picture's real size against the limit", () => {
    expect(base64Bytes(PNG)).toBe(70);
    expect(base64Bytes("AAAA")).toBe(3);
  });
});

describe("a reply moved into the editor", () => {
  it("turns the quoted original into a quote block", () => {
    const html = textToHtml("Sounds good.\n\nOn Tue, Ali wrote:\n> Can we meet at 3?\n> Thanks");
    expect(html).toBe(
      "<p>Sounds good.</p>\n<p>On Tue, Ali wrote:</p>\n<blockquote><p>Can we meet at 3?<br>\nThanks</p></blockquote>",
    );
  });
});

describe("addresses typed into a link", () => {
  it("accepts the ways people type them", () => {
    expect(normalizeLink("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeLink("example.com")).toBe("https://example.com");
    expect(normalizeLink("mena-speakers.com/speakers")).toBe("https://mena-speakers.com/speakers");
    expect(normalizeLink("ali@example.com")).toBe("mailto:ali@example.com");
    expect(normalizeLink("tel:+971500000000")).toBe("tel:+971500000000");
  });

  it("refuses what would link to nowhere, or run", () => {
    expect(normalizeLink("")).toBeNull();
    expect(normalizeLink("just words")).toBeNull();
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("data:text/html,hi")).toBeNull();
  });
});
