import { describe, expect, it } from "vitest";
import { bodyKindFor, htmlCarriesOwnDesign } from "@/lib/mail/html-design";

/** Roughly what Gmail puts on the wire for a note somebody typed. */
const typedNote = `
  <div dir="ltr">Hi — moving our call to Thursday, does 3pm work?<br><br>Thanks</div>
`;

/** A reply, with the quoted thread Gmail appends underneath. */
const quotedReply = `
  <div dir="ltr">Works for me.</div>
  <blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">
    <div dir="ltr">Hi — moving our call to Thursday?</div>
  </blockquote>
`;

/** A signature with one logo, which is still correspondence rather than design. */
const signedNote = `
  <div>Best,<br>Sam</div>
  <div><img src="cid:logo" alt="Acme" width="120"></div>
`;

/** The shape a marketing template arrives in. */
const newsletter = `
  <table width="100%" bgcolor="#ffffff"><tr><td align="center">
    <table width="600"><tr><td style="background-color:#000;color:#fff">The Last Call</td></tr>
    <tr><td><img src="https://cdn.example.com/hero.jpg" width="600"></td></tr>
    <tr><td><img src="https://cdn.example.com/shoe.jpg" width="280"></td></tr>
    </table>
  </td></tr></table>
`;

/** What Outlook puts round a note somebody typed — white, and nothing else. */
const outlookNote = `
  <div style="background-color: rgb(255, 255, 255); font-family: Aptos, sans-serif">
    <p>Dear Sabreen and Ayman,</p>
    <p>Kindly submit the departmental expenses for the month of August 2026.</p>
    <p>In Gratitude, Always,</p>
  </div>
`;

describe("htmlCarriesOwnDesign", () => {
  it("leaves ordinary correspondence alone", () => {
    expect(htmlCarriesOwnDesign(typedNote)).toBe(false);
    expect(htmlCarriesOwnDesign(quotedReply)).toBe(false);
    expect(htmlCarriesOwnDesign(signedNote)).toBe(false);
    expect(htmlCarriesOwnDesign(outlookNote)).toBe(false);
    expect(htmlCarriesOwnDesign("")).toBe(false);
  });

  it("recognises a designed message", () => {
    expect(htmlCarriesOwnDesign(newsletter)).toBe(true);
  });

  it("treats a background it actually paints as decisive", () => {
    // A dark reader cannot honour these, so the message has to keep its own surface.
    expect(htmlCarriesOwnDesign('<div style="background-color:#eee">hi</div>')).toBe(true);
    expect(htmlCarriesOwnDesign('<div bgcolor="#003366">hi</div>')).toBe(true);
    expect(htmlCarriesOwnDesign('<td background="tile.png">hi</td>')).toBe(true);
    expect(htmlCarriesOwnDesign('<div style="background:url(bg.png)">hi</div>')).toBe(true);
    expect(htmlCarriesOwnDesign('<div style="background:rgb(20,20,20)">hi</div>')).toBe(true);
  });

  it("does not count white or transparent, which is every plain mail client", () => {
    /*
     * Outlook writes rgb(255,255,255) onto correspondence, Apple Mail writes #FFFFFF.
     * Reading those as design put ordinary mail on a white sheet in a dark reader.
     */
    for (const value of [
      "rgb(255, 255, 255)",
      "rgb(255,255,255)",
      "rgba(255,255,255,1)",
      "rgba(0,0,0,0)",
      "#fff",
      "#FFFFFF",
      "white",
      "transparent",
      "inherit",
    ]) {
      expect(htmlCarriesOwnDesign(`<div style="background-color:${value}">hi</div>`)).toBe(false);
      expect(htmlCarriesOwnDesign(`<div bgcolor="${value}">hi</div>`)).toBe(false);
    }
  });

  it("still catches a dark panel sitting on a white page", () => {
    // The white wrapper is ignored; the black band inside it is not.
    expect(
      htmlCarriesOwnDesign(
        '<table bgcolor="#ffffff"><tr><td style="background-color:#000">Sale</td></tr></table>',
      ),
    ).toBe(true);
  });

  it("does not read tables as design at all", () => {
    /*
     * Word wraps a quoted reply in a table per block; one real thread had eighteen and
     * nothing else. Layout tables and correspondence tables are indistinguishable, so
     * neither counts — a newsletter is caught by its background or its pictures instead.
     */
    expect(htmlCarriesOwnDesign("<table><tr><td>1</td><td>2</td></tr></table>")).toBe(false);
    expect(htmlCarriesOwnDesign("<table></table>".repeat(18))).toBe(false);
  });

  it("does not count a tracking pixel as a picture", () => {
    const pixel = '<img src="https://t.example.com/o.gif" width="1" height="1">';
    expect(htmlCarriesOwnDesign(`<div>hello</div>${pixel}`)).toBe(false);
    expect(htmlCarriesOwnDesign(`<div>hi</div>${pixel}<img src="a.png"><img src="b.png">`)).toBe(
      true,
    );
  });

  it("needs more than one real image", () => {
    expect(htmlCarriesOwnDesign('<img src="a.png">')).toBe(false);
    expect(htmlCarriesOwnDesign('<img src="a.png"><img src="b.png">')).toBe(true);
  });

  it("is not fooled by the word background in text", () => {
    expect(htmlCarriesOwnDesign("<p>Some background on the project.</p>")).toBe(false);
  });
});

describe("bodyKindFor", () => {
  it("keeps a text-only message plain", () => {
    expect(bodyKindFor(false, "<p>hello</p>")).toBe("plain");
  });

  it("calls undesigned HTML simple, so the reader can theme it", () => {
    expect(bodyKindFor(true, typedNote)).toBe("simple");
    expect(bodyKindFor(true, quotedReply)).toBe("simple");
  });

  it("keeps a designed message as html, to be shown as it was built", () => {
    expect(bodyKindFor(true, newsletter)).toBe("html");
  });
});
