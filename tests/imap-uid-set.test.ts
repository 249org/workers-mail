import { describe, expect, it } from "vitest";
import { folderCreateRejected } from "@/lib/transport/imap-error";
import {
  createMailboxCandidates,
  expandImapSet,
  imapQuote,
  imapUidSet,
  inferHierarchyDelimiter,
  matchMailboxPath,
  parseCopyUid,
  parseListDelimiter,
  parseListMailbox,
  parseNamespacePersonal,
} from "@/lib/transport/imap-uid-set";

describe("imapUidSet", () => {
  it("makes edgeport issue a UID range instead of a comma list", () => {
    expect(imapUidSet("*").join(",")).toBe("*");
    expect(imapUidSet("9167:*").join(",")).toBe("9167:*");
    expect(imapUidSet("9167:9167").join(",")).toBe("9167:9167");
  });

  it("is non-empty so fetch does not short-circuit", () => {
    expect(imapUidSet("*").length).toBeGreaterThan(0);
  });

  it("expands a COPYUID sequence set in order", () => {
    expect(expandImapSet("42,44:46")).toEqual([42, 44, 45, 46]);
    expect(expandImapSet("10:8")).toEqual([8, 9, 10]);
  });
});

describe("imapQuote", () => {
  it("quotes mailbox names the way SELECT/MOVE expect", () => {
    expect(imapQuote("INBOX")).toBe('"INBOX"');
    expect(imapQuote("[Gmail]/Trash")).toBe('"[Gmail]/Trash"');
    expect(imapQuote('Folder "A"')).toBe('"Folder \\"A\\""');
  });
});

describe("parseCopyUid", () => {
  it("zips source UIDs onto destination UIDs", () => {
    const mapped = parseCopyUid({
      text: "[COPYUID 385052272 304,319 3956,3962] Completed",
      untagged: [],
    });
    expect(mapped.get(304)).toBe(3956);
    expect(mapped.get(319)).toBe(3962);
  });

  it("reads COPYUID from an untagged OK", () => {
    const mapped = parseCopyUid({
      text: "Done",
      untagged: ["* OK [COPYUID 1 42:44 1202:1204] moved"],
    });
    expect(mapped.get(42)).toBe(1202);
    expect(mapped.get(44)).toBe(1204);
  });
});

describe("parseListMailbox", () => {
  it("reads quoted and unquoted LIST names", () => {
    expect(parseListMailbox('* LIST (\\HasNoChildren) "/" "Projects"')).toBe("Projects");
    expect(parseListMailbox('* LIST (\\HasNoChildren) "/" "Folder \\"A\\""')).toBe('Folder "A"');
    expect(parseListMailbox('* LIST (\\HasNoChildren) "." INBOX.Receipts')).toBe("INBOX.Receipts");
  });

  it("reads the hierarchy delimiter", () => {
    expect(parseListDelimiter('* LIST (\\HasNoChildren) "." "INBOX.Spam"')).toBe(".");
    expect(parseListDelimiter('* LIST (\\HasNoChildren) "/" "Projects"')).toBe("/");
    expect(parseListDelimiter("* LIST (\\Noselect) NIL INBOX")).toBeNull();
  });

  it("ignores non-LIST lines", () => {
    expect(parseListMailbox("* 12 EXISTS")).toBeNull();
  });
});

describe("parseNamespacePersonal", () => {
  it("reads Courier/one.com and Gmail personal namespaces", () => {
    expect(parseNamespacePersonal('* NAMESPACE (("INBOX." ".")) NIL NIL')).toEqual({
      prefix: "INBOX.",
      delimiter: ".",
    });
    expect(parseNamespacePersonal('* NAMESPACE (("" "/")) NIL NIL')).toEqual({
      prefix: "",
      delimiter: "/",
    });
    expect(parseNamespacePersonal("* NAMESPACE NIL NIL NIL")).toBeNull();
  });
});

describe("createMailboxCandidates", () => {
  it("tries the leaf then INBOX.child on Courier-style hosts", () => {
    expect(
      createMailboxCandidates("others", { prefix: "INBOX.", delimiter: "." }, ["INBOX", "INBOX.Spam"]),
    ).toEqual(["others", "INBOX.others"]);
  });

  it("keeps a top-level name first for Gmail", () => {
    expect(createMailboxCandidates("Projects", { prefix: "", delimiter: "/" }, ["INBOX", "[Gmail]/Trash"])).toEqual([
      "Projects",
      "INBOX/Projects",
    ]);
  });

  it("infers a dot delimiter from INBOX.Spam when NAMESPACE is missing", () => {
    expect(inferHierarchyDelimiter(["INBOX", "INBOX.Spam"])).toBe(".");
    expect(createMailboxCandidates("others", null, ["INBOX", "INBOX.Spam"])).toEqual(["others", "INBOX.others"]);
  });
});

describe("folderCreateRejected", () => {
  it("keeps a short server phrase", () => {
    expect(folderCreateRejected("[CANNOT] Invalid mailbox name.")).toBe(
      "The mail server rejected that folder (Invalid mailbox name.).",
    );
  });
});

describe("matchMailboxPath", () => {
  it("prefers an exact path and falls back to the leaf", () => {
    expect(matchMailboxPath(["INBOX", "Projects"], "projects")).toBe("Projects");
    expect(matchMailboxPath(["INBOX", "INBOX.Receipts"], "Receipts")).toBe("INBOX.Receipts");
    expect(matchMailboxPath(["INBOX"], "Projects")).toBeNull();
  });
});
