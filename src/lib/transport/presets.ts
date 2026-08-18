export type ProviderPreset = {
  id: string;
  name: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  /** Shown when the provider requires an app password rather than the login one. */
  note?: string;
};

type NamedProvider = ProviderPreset & { domains: string[] };

const NAMED_PROVIDERS: NamedProvider[] = [
  {
    id: "one.com",
    name: "one.com",
    domains: ["one.com"],
    imapHost: "imap.one.com",
    imapPort: 993,
    smtpHost: "send.one.com",
    smtpPort: 465,
    note: "Works for custom domains hosted at one.com. Username is the full address.",
  },
  {
    id: "gmail",
    name: "Gmail",
    domains: ["gmail.com", "googlemail.com"],
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    note: "Gmail requires an app password when two-factor authentication is on.",
  },
  {
    id: "outlook",
    name: "Outlook",
    domains: ["outlook.com", "hotmail.com", "live.com"],
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  {
    id: "yahoo",
    name: "Yahoo",
    domains: ["yahoo.com"],
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    note: "Yahoo requires an app password generated in account security settings.",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    domains: ["fastmail.com"],
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    note: "Fastmail requires an app password scoped to IMAP and SMTP.",
  },
  {
    id: "icloud",
    name: "iCloud",
    domains: ["icloud.com", "me.com"],
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    note: "iCloud requires an app-specific password.",
  },
  {
    id: "zoho",
    name: "Zoho",
    domains: ["zoho.com"],
    imapHost: "imap.zoho.com",
    imapPort: 993,
    smtpHost: "smtp.zoho.com",
    smtpPort: 587,
  },
];

export const OTHER_PROVIDER_ID = "other";

/** Providers the user can pick when the address domain is not the mail host. */
export function namedProviders(): ProviderPreset[] {
  return NAMED_PROVIDERS.map(({ domains: _domains, ...preset }) => preset);
}

export function presetById(id: string): ProviderPreset | null {
  const match = NAMED_PROVIDERS.find((provider) => provider.id === id);
  if (!match) return null;
  const { domains: _domains, ...preset } = match;
  return preset;
}

/**
 * Known consumer domains only. Custom domains (one.com, cPanel, Google Workspace)
 * must be chosen by the user — guessing `imap.{domain}` is usually wrong.
 */
export function presetFor(address: string): ProviderPreset | null {
  const domain = address.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  const match = NAMED_PROVIDERS.find((provider) => provider.domains.includes(domain));
  return match ? presetById(match.id) : null;
}

export function tlsForImapPort(port: number): "implicit" | "starttls" {
  return port === 143 ? "starttls" : "implicit";
}

export function tlsForSmtpPort(port: number): "implicit" | "starttls" {
  return port === 465 ? "implicit" : "starttls";
}
