import { describe, expect, it } from "vitest";
import { imapUidSet } from "@/lib/transport/imap-uid-set";

describe("imapUidSet", () => {
  it("makes edgeport issue a UID range instead of a comma list", () => {
    expect(imapUidSet("*").join(",")).toBe("*");
    expect(imapUidSet("9167:*").join(",")).toBe("9167:*");
    expect(imapUidSet("9167:9167").join(",")).toBe("9167:9167");
  });

  it("is non-empty so fetch does not short-circuit", () => {
    expect(imapUidSet("*").length).toBeGreaterThan(0);
  });
});
