import { describe, expect, it } from "vitest";
import { listedAttachments } from "@/lib/mail/attachment-list";

const file = (id: string, contentId: string | null, inline = false) => ({
  id,
  inline,
  contentId,
});

const shows = (...ids: string[]) =>
  ids.map((id) => `<img src="/api/attachments/${id}">`).join("");

describe("listedAttachments", () => {
  it("lists a real file even though Gmail gave it a Content-Id", () => {
    /*
     * Gmail stamps a Content-Id on every part, so two forwarded PDFs carried one and
     * were read as embedded images. Nothing in the body referred to them.
     */
    const files = [file("att_pdf_a", "f_mub2u9zq0"), file("att_pdf_b", "f_mub2uuko1")];
    expect(listedAttachments(files, "<p>Check docs.</p>").map((f) => f.id)).toEqual([
      "att_pdf_a",
      "att_pdf_b",
    ]);
  });

  it("keeps a picture the body shows out of the list", () => {
    // A signature logo is part of the message, not something to download separately.
    const files = [file("att_logo", "logo@sig"), file("att_deck", "f_deck")];
    expect(listedAttachments(files, shows("att_logo")).map((f) => f.id)).toEqual(["att_deck"]);
  });

  it("still honours a part that declared itself inline", () => {
    const files = [file("att_inline", "x@y", true), file("att_doc", null)];
    expect(listedAttachments(files, "").map((f) => f.id)).toEqual(["att_doc"]);
  });

  it("lists a file with no Content-Id at all", () => {
    expect(listedAttachments([file("att_plain", null)], "").map((f) => f.id)).toEqual([
      "att_plain",
    ]);
  });

  it("does not mistake one id for another that starts the same way", () => {
    // `att_1` must not be hidden because the body embeds `att_12`.
    const files = [file("att_1", "a@b"), file("att_12", "c@d")];
    expect(listedAttachments(files, shows("att_12")).map((f) => f.id)).toEqual(["att_1"]);
  });

  it("lists everything when there is no body to consult", () => {
    // Erring towards showing a file beats hiding one that was really sent.
    const files = [file("att_a", "a@b"), file("att_b", "c@d")];
    expect(listedAttachments(files, "").map((f) => f.id)).toEqual(["att_a", "att_b"]);
  });
});
