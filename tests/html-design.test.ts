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

describe("htmlCarriesOwnDesign", () => {
  it("leaves ordinary correspondence alone", () => {
    expect(htmlCarriesOwnDesign(typedNote)).toBe(false);
    expect(htmlCarriesOwnDesign(quotedReply)).toBe(false);
    expect(htmlCarriesOwnDesign(signedNote)).toBe(false);
    expect(htmlCarriesOwnDesign("")).toBe(false);
  });

  it("recognises a designed message", () => {
    expect(htmlCarriesOwnDesign(newsletter)).toBe(true);
  });

  it("treats any background as decisive", () => {
    // A dark reader cannot honour these, so the message has to keep its own surface.
    expect(htmlCarriesOwnDesign('<div bgcolor="#fff">hi</div>')).toBe(true);
    expect(htmlCarriesOwnDesign('<div style="background-color:#eee">hi</div>')).toBe(true);
    expect(htmlCarriesOwnDesign('<td background="tile.png">hi</td>')).toBe(true);
    expect(htmlCarriesOwnDesign('<div style="background:#eee">hi</div>')).toBe(true);
  });

  it("does not call a single table a layout", () => {
    // A pasted spreadsheet range is content, not a design.
    expect(htmlCarriesOwnDesign("<table><tr><td>1</td><td>2</td></tr></table>")).toBe(false);
    expect(htmlCarriesOwnDesign("<table></table><table></table>")).toBe(true);
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
