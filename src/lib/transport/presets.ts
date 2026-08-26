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

type NamedProvider = ProviderPreset & {
  domains: string[];
  /** MX hostname equals a suffix or ends with `.${suffix}` — observed DNS, not a guess. */
  mxSuffixes: string[];
};

const NAMED_PROVIDERS: NamedProvider[] = [
  {
    id: "one.com",
    name: "one.com",
    domains: ["one.com"],
    mxSuffixes: ["one.com"],
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
    mxSuffixes: ["google.com", "googlemail.com"],
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
    mxSuffixes: ["outlook.com", "office365.com", "hotmail.com", "live.com"],
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    note: "Microsoft dropped password logins for IMAP; these accounts link over OAuth.",
  },
  {
    id: "yahoo",
    name: "Yahoo",
    domains: ["yahoo.com"],
    mxSuffixes: ["yahoo.com", "yahoodns.net"],
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
    mxSuffixes: ["fastmail.com", "messagingengine.com"],
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
    mxSuffixes: ["icloud.com", "me.com"],
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
    mxSuffixes: ["zoho.com", "zoho.eu", "zoho.in"],
    imapHost: "imap.zoho.com",
    imapPort: 993,
    smtpHost: "smtp.zoho.com",
    smtpPort: 587,
  },
];

export const OTHER_PROVIDER_ID = "other";

export type EasyProviderId = "gmail" | "outlook";

export type TransportHosts = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

export function hostsFromPreset(preset: ProviderPreset): TransportHosts {
  return {
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
  };
}

export function hostsForEasyProvider(id: EasyProviderId): TransportHosts {
  const preset = presetById(id);
  if (!preset) throw new Error(`No IMAP preset for ${id}`);
  return hostsFromPreset(preset);
}

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
 * Consumer mailbox domains only (`gmail.com`, `one.com`, …). Custom domains are
 * resolved from MX / autoconfig — never by guessing `imap.{domain}`.
 */
export function presetFor(address: string): ProviderPreset | null {
  const domain = address.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  const match = NAMED_PROVIDERS.find((provider) => provider.domains.includes(domain));
  return match ? presetById(match.id) : null;
}

/** Match an observed MX hostname to a provider whose published IMAP hosts we already know. */
export function providerForMxHost(mxHost: string): ProviderPreset | null {
  const host = mxHost.replace(/\.$/, "").trim().toLowerCase();
  if (!host) return null;
  const match = NAMED_PROVIDERS.find((provider) =>
    provider.mxSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)),
  );
  return match ? presetById(match.id) : null;
}

export function tlsForImapPort(port: number): "implicit" | "starttls" {
  return port === 143 ? "starttls" : "implicit";
}

export function tlsForSmtpPort(port: number): "implicit" | "starttls" {
  return port === 465 ? "implicit" : "starttls";
}

/**
 * Gmail and Microsoft copy anything sent through their SMTP into Sent themselves.
 * Appending a second copy there duplicates the message and can make the server
 * reject the upload, so those providers are skipped.
 */
export function smtpSavesToSentFolder(smtpHost: string | null | undefined): boolean {
  const host = smtpHost?.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  // Exact hosts only. Suffix matching would let a lookalike domain suppress the
  // append, and an unknown host is better served by a possible duplicate than by a
  // Sent folder that stays empty.
  return SELF_FILING_SMTP_HOSTS.has(host);
}

const SELF_FILING_SMTP_HOSTS = new Set([
  "smtp.gmail.com",
  "smtp.office365.com",
  "smtp-mail.outlook.com",
  "smtp.live.com",
]);

export type ProviderAuthNote =
  /** Ordinary password refused; a generated app password works. */
  | { kind: "app-password"; label: string; href: string }
  /** No password of any kind works; the account must be linked over OAuth. */
  | { kind: "oauth-only"; label: string; provider: OauthLinkProvider };

export type OauthLinkProvider = "google" | "microsoft";

/**
 * Providers that reject a normal account password over IMAP. Gmail and Microsoft
 * dropped plain-password IMAP, so "wrong password" is nearly always a missing app
 * password rather than a typo — the form and the sync error both say so.
 */
/*
 * Microsoft withdrew basic authentication from personal Outlook, Hotmail and Live
 * accounts on 16 September 2024, which retired app passwords along with it: an IMAP
 * login with one is refused outright now, so the only way in is one-click sign-in.
 * The others still issue an app password for accounts with two-factor enabled.
 */
const PROVIDER_AUTH: Record<string, ProviderAuthNote> = {
  gmail: {
    kind: "app-password",
    label: "Gmail",
    href: "https://myaccount.google.com/apppasswords",
  },
  outlook: { kind: "oauth-only", label: "Microsoft", provider: "microsoft" },
  yahoo: {
    kind: "app-password",
    label: "Yahoo",
    href: "https://login.yahoo.com/account/security",
  },
  icloud: {
    kind: "app-password",
    label: "iCloud",
    href: "https://appleid.apple.com/account/manage",
  },
  fastmail: {
    kind: "app-password",
    label: "Fastmail",
    href: "https://app.fastmail.com/settings/security/apppasswords",
  },
};

/** What an address needs to sign in, or null when the account password is fine. */
export function providerAuthNote(address: string): ProviderAuthNote | null {
  const preset = presetFor(address);
  return preset ? (PROVIDER_AUTH[preset.id] ?? null) : null;
}

/** The same note keyed by IMAP host, for errors raised after the mailbox is stored. */
export function providerAuthNoteForHost(
  imapHost: string | null | undefined,
): ProviderAuthNote | null {
  const host = imapHost?.trim().toLowerCase();
  if (!host) return null;
  for (const [id, help] of Object.entries(PROVIDER_AUTH)) {
    const preset = presetById(id);
    if (preset && preset.imapHost.toLowerCase() === host) return help;
  }
  return null;
}
