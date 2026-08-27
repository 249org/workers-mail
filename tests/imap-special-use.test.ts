import { describe, expect, it } from "vitest";
import { parseListAttributes } from "@/lib/transport/imap-uid-set";
import { mailboxLeaf, roleForMailbox } from "@/lib/transport/imap-folder-roles";

describe("parseListAttributes", () => {
  it("reads the attributes off a LIST reply", () => {
    expect(parseListAttributes('* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Bin"')).toEqual([
      "hasnochildren",
      "trash",
    ]);
  });

  it("returns nothing for a line that is not a LIST reply", () => {
    expect(parseListAttributes("* 42 EXISTS")).toEqual([]);
    expect(parseListAttributes('* LSUB () "/" "INBOX"')).toEqual([]);
  });

  it("handles an empty attribute list", () => {
    expect(parseListAttributes('* LIST () "/" "Receipts"')).toEqual([]);
  });
});

describe("roleForMailbox", () => {
  it("finds the trash whatever the server calls it", () => {
    // Gmail names it Bin in en-GB and Corbeille in French; only \Trash is constant.
    for (const path of ["[Gmail]/Bin", "[Gmail]/Corbeille", "[Gmail]/Papierkorb"]) {
      expect(roleForMailbox({ path, attributes: ["hasnochildren", "trash"] })).toEqual({
        role: "trash",
        name: "Trash",
      });
    }
  });

  it("maps the rest of the special-use attributes", () => {
    expect(roleForMailbox({ path: "[Gmail]/Sent Mail", attributes: ["sent"] })?.role).toBe("sent");
    expect(roleForMailbox({ path: "[Gmail]/Drafts", attributes: ["drafts"] })?.role).toBe("drafts");
    expect(roleForMailbox({ path: "[Gmail]/All Mail", attributes: ["all"] })?.role).toBe("archive");
  });

  it("still reads the name when the server sends no attributes", () => {
    expect(roleForMailbox({ path: "INBOX", attributes: [] })?.role).toBe("inbox");
    expect(roleForMailbox({ path: "Trash", attributes: [] })?.role).toBe("trash");
    expect(roleForMailbox({ path: "Sent Items", attributes: [] })?.role).toBe("sent");
  });

  it("prefers the attribute over a name that reads like another role", () => {
    // A user folder called "Sent to accountant" is not the Sent folder.
    expect(roleForMailbox({ path: "Archive", attributes: ["trash"] })?.role).toBe("trash");
  });

  it("leaves an ordinary folder alone", () => {
    expect(roleForMailbox({ path: "Unroll.me", attributes: ["hasnochildren"] })).toBeNull();
    expect(roleForMailbox({ path: "[Gmail]/Important", attributes: [] })).toBeNull();
  });
});

describe("mailboxLeaf", () => {
  it("uses the delimiter the server reported, not a guess", () => {
    // one.com nests under INBOX with "."; Gmail nests with "/". Each server's own
    // delimiter is the only thing that says which dots are structure and which are text.
    expect(mailboxLeaf("INBOX.Spam", ".")).toBe("Spam");
    expect(mailboxLeaf("INBOX.others", ".")).toBe("others");
    expect(mailboxLeaf("[Gmail]/All Mail", "/")).toBe("All Mail");
  });

  it("keeps a dot that is part of the name", () => {
    // Splitting on "." regardless of the server once turned this into "me".
    expect(mailboxLeaf("Unroll.me", "/")).toBe("Unroll.me");
    expect(mailboxLeaf("Unroll.me/Unsubscribed", "/")).toBe("Unsubscribed");
  });

  it("falls back to / when the server reports no delimiter", () => {
    expect(mailboxLeaf("Work/Reports", null)).toBe("Reports");
    expect(mailboxLeaf("INBOX", null)).toBe("INBOX");
  });

  it("never returns an empty name", () => {
    expect(mailboxLeaf("Archive/", "/")).toBe("Archive");
    expect(mailboxLeaf("/", "/")).toBe("/");
  });
});

describe("roleForMailbox with a delimiter", () => {
  it("recognises a nested system folder by its leaf", () => {
    expect(roleForMailbox({ path: "INBOX.Trash", attributes: [] }, ".")).toEqual({
      role: "trash",
      name: "Trash",
    });
    expect(roleForMailbox({ path: "INBOX.Sent", attributes: [] }, ".")?.role).toBe("sent");
  });

  it("leaves a nested ordinary folder to be named by its leaf", () => {
    expect(roleForMailbox({ path: "INBOX.others", attributes: [] }, ".")).toBeNull();
  });
});
