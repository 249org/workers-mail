import { describe, expect, it } from "vitest";
import { attachmentKeyFor } from "@/lib/mail/store";

describe("attachmentKeyFor", () => {
  it("gives each attachment its own R2 key even when filenames match", () => {
    const a = attachmentKeyFor("mbx_1", "msg_1", "att_a", "image.png");
    const b = attachmentKeyFor("mbx_1", "msg_1", "att_b", "image.png");
    expect(a).not.toBe(b);
    expect(a).toContain("att_a-image.png");
    expect(b).toContain("att_b-image.png");
  });
});
