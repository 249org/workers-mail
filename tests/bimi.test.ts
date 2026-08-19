import { describe, expect, it } from "vitest";
import {
  bimiIssues,
  bimiReady,
  bimiRecordName,
  bimiRecordValue,
  dmarcPolicyOf,
} from "@/lib/mail/bimi";

const LOGO = "https://example.com/logo.svg";
const CERT = "https://example.com/vmc.pem";

describe("bimiRecordValue", () => {
  it("returns null until a logo is configured", () => {
    expect(bimiRecordValue({ logoUrl: null, certUrl: null })).toBeNull();
  });

  it("emits an empty a= when no certificate is issued yet", () => {
    expect(bimiRecordValue({ logoUrl: LOGO, certUrl: null })).toBe(
      `v=BIMI1; l=${LOGO}; a=;`,
    );
  });

  it("includes the certificate when present", () => {
    expect(bimiRecordValue({ logoUrl: LOGO, certUrl: CERT })).toBe(
      `v=BIMI1; l=${LOGO}; a=${CERT};`,
    );
  });
});

describe("bimiRecordName", () => {
  it("uses the default selector", () => {
    expect(bimiRecordName("example.com")).toBe("default._bimi.example.com");
  });
});

describe("dmarcPolicyOf", () => {
  it("reads the policy from a record", () => {
    expect(dmarcPolicyOf("v=DMARC1; p=reject; rua=mailto:a@b.c")).toBe("reject");
    expect(dmarcPolicyOf("v=DMARC1;p=quarantine")).toBe("quarantine");
    expect(dmarcPolicyOf("v=DMARC1; p=none")).toBe("none");
  });

  it("does not mistake subdomain policy for the main one", () => {
    expect(dmarcPolicyOf("v=DMARC1; p=reject; sp=none")).toBe("reject");
  });

  it("returns null when absent", () => {
    expect(dmarcPolicyOf(null)).toBeNull();
    expect(dmarcPolicyOf("v=DMARC1; rua=mailto:a@b.c")).toBeNull();
  });
});

describe("bimiIssues", () => {
  it("blocks on a missing logo", () => {
    const issues = bimiIssues({ logoUrl: null, certUrl: null }, "reject");
    expect(issues.some((issue) => issue.level === "blocker")).toBe(true);
  });

  it("blocks on DMARC at p=none, which does not count as enforcement", () => {
    const issues = bimiIssues({ logoUrl: LOGO, certUrl: CERT }, "none");
    expect(issues.some((issue) => issue.level === "blocker" && /p=none/.test(issue.message))).toBe(
      true,
    );
  });

  it("blocks a non-SVG logo", () => {
    const issues = bimiIssues({ logoUrl: "https://example.com/logo.png", certUrl: CERT }, "reject");
    expect(issues.some((issue) => /SVG/.test(issue.message))).toBe(true);
  });

  it("blocks a logo served over plain http", () => {
    const issues = bimiIssues({ logoUrl: "http://example.com/logo.svg", certUrl: CERT }, "reject");
    expect(issues.some((issue) => /HTTPS/.test(issue.message))).toBe(true);
  });

  it("warns rather than blocks when no certificate is set", () => {
    const issues = bimiIssues({ logoUrl: LOGO, certUrl: null }, "reject");
    const cert = issues.find((issue) => /VMC or CMC/.test(issue.message));
    expect(cert?.level).toBe("warning");
  });

  it("is clean once logo, certificate and enforcement line up", () => {
    expect(bimiIssues({ logoUrl: LOGO, certUrl: CERT }, "reject")).toEqual([]);
    expect(bimiReady({ logoUrl: LOGO, certUrl: CERT }, "quarantine")).toBe(true);
  });

  it("treats a missing certificate as still publishable", () => {
    expect(bimiReady({ logoUrl: LOGO, certUrl: null }, "reject")).toBe(true);
  });
});
