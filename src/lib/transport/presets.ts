export type ProviderPreset = {
  name: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  /** Shown when the provider requires an app password rather than the login one. */
  note?: string;
};

const PRESETS: Record<string, ProviderPreset> = {
  "gmail.com": {
    name: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    note: "Gmail requires an app password when two-factor authentication is on.",
  },
  "googlemail.com": {
    name: "Gmail",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    note: "Gmail requires an app password when two-factor authentication is on.",
  },
  "outlook.com": {
    name: "Outlook",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  "hotmail.com": {
    name: "Outlook",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  "live.com": {
    name: "Outlook",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  "yahoo.com": {
    name: "Yahoo",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    note: "Yahoo requires an app password generated in account security settings.",
  },
  "fastmail.com": {
    name: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    note: "Fastmail requires an app password scoped to IMAP and SMTP.",
  },
  "icloud.com": {
    name: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    note: "iCloud requires an app-specific password.",
  },
  "me.com": {
    name: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    note: "iCloud requires an app-specific password.",
  },
  "zoho.com": {
    name: "Zoho",
    imapHost: "imap.zoho.com",
    imapPort: 993,
    smtpHost: "smtp.zoho.com",
    smtpPort: 587,
  },
};

/**
 * Guesses connection settings from an address. Unknown domains fall back to the
 * `imap.`/`smtp.` convention, which is right often enough to be worth offering.
 */
export function presetFor(address: string): ProviderPreset | null {
  const domain = address.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;

  const known = PRESETS[domain];
  if (known) return known;
  if (!domain.includes(".")) return null;

  return {
    name: domain,
    imapHost: `imap.${domain}`,
    imapPort: 993,
    smtpHost: `smtp.${domain}`,
    smtpPort: 587,
  };
}

export function tlsForImapPort(port: number): "implicit" | "starttls" {
  return port === 143 ? "starttls" : "implicit";
}

export function tlsForSmtpPort(port: number): "implicit" | "starttls" {
  return port === 465 ? "implicit" : "starttls";
}
