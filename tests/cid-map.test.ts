import { describe, expect, it } from "vitest";
import { cidMapFrom } from "@/app/api/messages/[messageId]/route";

type Parsed = { filename: string; contentId?: string };

const stored = (id: string, filename: string, contentId: string | null) => ({
  id,
  filename,
  contentId,
});

/** Outlook names every inline image imageNNN.png and gives each its own Content-Id. */
const signature = [
  stored("att_c", "image003.png", "image003.png@01DD33C3.DFFC0DE0"),
  stored("att_a", "image001.png", "image001.png@01DD33C3.DFFC0DE0"),
  stored("att_b", "image002.jpg", "image002.jpg@01DD33C3.DFFC0DE0"),
];

const parsedSignature: Parsed[] = [
  { filename: "image001.png", contentId: "image001.png@01DD33C3.DFFC0DE0" },
  { filename: "image002.jpg", contentId: "image002.jpg@01DD33C3.DFFC0DE0" },
  { filename: "image003.png", contentId: "image003.png@01DD33C3.DFFC0DE0" },
];

describe("cidMapFrom", () => {
  it("points each Content-Id at its own attachment, whatever order the rows come back in", () => {
    const map = cidMapFrom(signature, parsedSignature as never);
    expect(map.get("image001.png@01dd33c3.dffc0de0")).toBe("/api/attachments/att_a");
    expect(map.get("image002.jpg@01dd33c3.dffc0de0")).toBe("/api/attachments/att_b");
    expect(map.get("image003.png@01dd33c3.dffc0de0")).toBe("/api/attachments/att_c");
  });

  it("does not let a shared filename claim another image's Content-Id", () => {
    /*
     * A signature carried through a thread repeats image001.png under a new Content-Id
     * each time. Matching on the name first paired the wrong two, so a reply showed the
     * picture from another message in the chain.
     */
    const rows = [
      stored("att_old", "image001.png", "image001.png@OLD"),
      stored("att_new", "image001.png", "image001.png@NEW"),
    ];
    const map = cidMapFrom(rows, [
      { filename: "image001.png", contentId: "image001.png@NEW" },
      { filename: "image001.png", contentId: "image001.png@OLD" },
    ] as never);
    expect(map.get("image001.png@new")).toBe("/api/attachments/att_new");
    expect(map.get("image001.png@old")).toBe("/api/attachments/att_old");
  });

  it("falls back to the filename when a Content-Id is missing", () => {
    const map = cidMapFrom([stored("att_1", "logo.png", null)], [
      { filename: "logo.png" },
    ] as never);
    expect(map.get("logo.png")).toBe("/api/attachments/att_1");
  });

  it("never hands one attachment to an image it does not belong to", () => {
    // Nothing matches, so nothing is paired — a missing image beats the wrong one.
    const map = cidMapFrom([stored("att_1", "logo.png", "logo.png@a")], [
      { filename: "banner.png", contentId: "banner.png@b" },
    ] as never);
    expect(map.get("banner.png@b")).toBeUndefined();
    // The stored row still offers itself under its own identity.
    expect(map.get("logo.png@a")).toBe("/api/attachments/att_1");
  });

  it("keeps an attachment the message never referenced", () => {
    const map = cidMapFrom(
      [stored("att_1", "image001.png", "image001.png@a"), stored("att_pdf", "deck.pdf", null)],
      [{ filename: "image001.png", contentId: "image001.png@a" }] as never,
    );
    expect(map.get("image001.png@a")).toBe("/api/attachments/att_1");
    expect(map.get("deck.pdf")).toBe("/api/attachments/att_pdf");
  });
});
