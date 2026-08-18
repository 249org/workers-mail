import { describe, expect, it } from "vitest";
import { folderIconName } from "@/components/mail/icons";

describe("folderIconName", () => {
  it("maps special roles to their icons", () => {
    expect(folderIconName({ role: "inbox", name: "Inbox" })).toBe("inbox");
    expect(folderIconName({ role: "sent", name: "Sent" })).toBe("sent");
    expect(folderIconName({ role: "drafts", name: "Drafts" })).toBe("drafts");
    expect(folderIconName({ role: "archive", name: "Archive" })).toBe("archive");
    expect(folderIconName({ role: "trash", name: "Trash" })).toBe("trash");
  });

  it("treats spam and junk names as spam even when the role is custom", () => {
    expect(folderIconName({ role: "custom", name: "Spam" })).toBe("spam");
    expect(folderIconName({ role: "custom", name: "Junk E-mail" })).toBe("spam");
  });

  it("falls back to a folder for anything else", () => {
    expect(folderIconName({ role: "custom", name: "Receipts" })).toBe("folder");
  });
});
