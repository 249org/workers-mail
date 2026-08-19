import { describe, expect, it } from "vitest";
import { parseFolderName, partitionFolders } from "@/lib/mail/folder-name";

describe("parseFolderName", () => {
  it("trims and collapses spaces", () => {
    expect(parseFolderName("  Receipts  2024 ")).toEqual({ ok: true, name: "Receipts 2024" });
  });

  it("rejects empty and reserved names", () => {
    expect(parseFolderName("   ").ok).toBe(false);
    expect(parseFolderName("Inbox").ok).toBe(false);
    expect(parseFolderName("trash").ok).toBe(false);
  });

  it("rejects control characters and wrapping separators", () => {
    expect(parseFolderName("A\\B").ok).toBe(false);
    expect(parseFolderName("/Projects").ok).toBe(false);
    expect(parseFolderName("Projects/").ok).toBe(false);
  });
});

describe("partitionFolders", () => {
  it("keeps system folders in rail order and custom folders after", () => {
    const folders = [
      { id: "1", role: "custom", name: "Receipts" },
      { id: "2", role: "trash", name: "Trash" },
      { id: "3", role: "inbox", name: "Inbox" },
      { id: "4", role: "sent", name: "Sent" },
    ];
    const { system, custom } = partitionFolders(folders);
    expect(system.map((folder) => folder.role)).toEqual(["inbox", "sent", "trash"]);
    expect(custom.map((folder) => folder.name)).toEqual(["Receipts"]);
  });
});
