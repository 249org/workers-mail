import { describe, expect, it } from "vitest";
import { sniffImageType, wrapOutboundHtml } from "@/lib/mail/profile-photo";

describe("wrapOutboundHtml", () => {
  it("puts a cid photo above the body", () => {
    const html = wrapOutboundHtml("<p>Hi</p>", { name: "Sam", address: "sam@example.com" });
    expect(html).toContain('src="cid:profile-photo@workers-mail"');
    expect(html).toContain("Sam");
    expect(html).toContain("sam@example.com");
    expect(html).toContain("<p>Hi</p>");
  });

  it("does not wrap twice", () => {
    const once = wrapOutboundHtml("<p>Hi</p>", { address: "sam@example.com" });
    expect(wrapOutboundHtml(once, { address: "sam@example.com" })).toBe(once);
  });

  it("escapes the sender name", () => {
    const html = wrapOutboundHtml("<p>Hi</p>", { name: "A <B>", address: "a@b.c" });
    expect(html).toContain("A &lt;B&gt;");
    expect(html).not.toContain("A <B>");
  });
});

describe("sniffImageType", () => {
  it("reads jpeg, png, and webp magic", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(
      sniffImageType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([0x00, 0x01]))).toBeNull();
  });
});
