import { describe, expect, it } from "vitest";
import { folderBadge } from "@/lib/mail/queries";
import { roleForMailbox } from "@/lib/transport/imap-folder-roles";

const four = { unread: 1, total: 4 };

describe("folderBadge", () => {
  it("counts what is sitting in the folders nobody reads through", () => {
    // Spam showed 1 while holding 4, and Trash showed 2 while holding 14.
    for (const role of ["trash", "drafts", "junk"]) {
      expect(folderBadge(role, four)).toBe(4);
    }
  });

  it("counts unread where mail is actually read", () => {
    for (const role of ["inbox", "archive", "sent", "custom"]) {
      expect(folderBadge(role, four)).toBe(1);
    }
  });

  it("shows nothing for a folder with no messages", () => {
    for (const role of ["inbox", "trash", "junk", "drafts", "custom"]) {
      expect(folderBadge(role, undefined)).toBe(0);
      expect(folderBadge(role, { unread: 0, total: 0 })).toBe(0);
    }
  });

  it("every role a folder can hold has a rule", () => {
    const roles = ["inbox", "sent", "drafts", "trash", "archive", "junk", "custom"];
    for (const role of roles) {
      const badge = folderBadge(role, four);
      expect(badge === four.total || badge === four.unread).toBe(true);
    }
  });
});

describe("junk is recognised as its own role", () => {
  it("trusts the SPECIAL-USE attribute in any language", () => {
    expect(roleForMailbox({ path: "[Gmail]/Spam", attributes: ["junk"] })).toEqual({
      role: "junk",
      name: "Spam",
    });
    expect(roleForMailbox({ path: "[Gmail]/Correo no deseado", attributes: ["junk"] })?.role).toBe(
      "junk",
    );
  });

  it("falls back to the folder's own name", () => {
    expect(roleForMailbox({ path: "INBOX.Spam", attributes: [] }, ".")?.role).toBe("junk");
    expect(roleForMailbox({ path: "Junk", attributes: [] })?.role).toBe("junk");
  });

  it("does not claim a folder that merely mentions junk", () => {
    // Unlike the looser system-folder patterns, this one has to match the whole name.
    expect(roleForMailbox({ path: "Junk drawer", attributes: [] })).toBeNull();
    expect(roleForMailbox({ path: "Spam recipes", attributes: [] })).toBeNull();
  });
});
