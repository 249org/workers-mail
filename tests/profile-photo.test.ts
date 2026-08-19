import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/lib/mail/profile-photo";

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
