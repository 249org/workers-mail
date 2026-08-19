/**
 * BIMI is the only mechanism that puts a sender's logo next to their name in Gmail.
 * A logo cannot be pushed from inside a message — the receiving provider looks it up
 * from DNS, and only trusts it when the domain authenticates and a certificate
 * authority has vouched for the mark.
 *
 * See https://bimigroup.org/ for the specification.
 */

export type BimiConfig = {
  logoUrl: string | null;
  certUrl: string | null;
};

export type BimiIssue = {
  level: "blocker" | "warning";
  message: string;
};

export const BIMI_SELECTOR = "default._bimi";

export function bimiRecordName(domain: string): string {
  return `${BIMI_SELECTOR}.${domain}`;
}

/** Builds the TXT value. `a=` is omitted when no certificate has been issued yet. */
export function bimiRecordValue(config: BimiConfig): string | null {
  if (!config.logoUrl) return null;
  const parts = ["v=BIMI1", `l=${config.logoUrl}`];
  parts.push(`a=${config.certUrl ?? ""}`);
  return `${parts.join("; ")};`;
}

/**
 * Reports what still stands between the current configuration and a logo actually
 * rendering. DMARC has to be at enforcement, and Gmail requires a certificate.
 */
export function bimiIssues(config: BimiConfig, dmarcPolicy: string | null): BimiIssue[] {
  const issues: BimiIssue[] = [];

  if (!config.logoUrl) {
    issues.push({ level: "blocker", message: "No logo URL set." });
  } else {
    if (!config.logoUrl.startsWith("https://")) {
      issues.push({ level: "blocker", message: "The logo must be served over HTTPS." });
    }
    if (!/\.svgz?$/i.test(new URL(config.logoUrl, "https://x").pathname)) {
      issues.push({
        level: "blocker",
        message: "The logo must be an SVG — specifically SVG Tiny Portable/Secure.",
      });
    }
  }

  if (dmarcPolicy === null) {
    issues.push({ level: "blocker", message: "No DMARC record found for this domain." });
  } else if (dmarcPolicy === "none") {
    issues.push({
      level: "blocker",
      message:
        "DMARC is at p=none. BIMI needs enforcement, so move to p=quarantine or p=reject once your reports look clean.",
    });
  }

  if (!config.certUrl) {
    issues.push({
      level: "warning",
      message:
        "No VMC or CMC set. Gmail will not display the logo without one; a VMC also adds the blue checkmark but needs a registered trademark.",
    });
  } else if (!config.certUrl.startsWith("https://")) {
    issues.push({ level: "blocker", message: "The certificate must be served over HTTPS." });
  }

  return issues;
}

/** Reads the policy out of a DMARC TXT value, e.g. `v=DMARC1; p=reject;` -> `reject`. */
export function dmarcPolicyOf(record: string | null | undefined): string | null {
  if (!record) return null;
  const match = record.match(/(?:^|;)\s*p\s*=\s*([a-z]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function bimiReady(config: BimiConfig, dmarcPolicy: string | null): boolean {
  return bimiIssues(config, dmarcPolicy).every((issue) => issue.level !== "blocker");
}
