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
    note: "Microsoft accounts with two-step verification need an app password.",
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

export type EasyProvider = {
  id: EasyProviderId;
  label: string;
  blurb: string;
  addressPlaceholder: string;
  passwordLabel: string;
  passwordHint: string;
  helpHref: string;
  helpLabel: string;
};

/** First-class connect options — hosts are filled in; the user types address + app password. */
export const EASY_PROVIDERS: EasyProvider[] = [
  {
    id: "gmail",
    label: "Google",
    blurb: "Gmail and Google Workspace",
    addressPlaceholder: "you@gmail.com",
    passwordLabel: "App password",
    passwordHint: "A 16-character password from Google — not the one you sign in with.",
    helpHref: "https://myaccount.google.com/apppasswords",
    helpLabel: "Create an app password",
  },
  {
    id: "outlook",
    label: "Microsoft",
    blurb: "Outlook, Hotmail, and Microsoft 365",
    addressPlaceholder: "you@outlook.com",
    passwordLabel: "App password",
    passwordHint: "From your Microsoft account if two-step verification is on.",
    helpHref: "https://account.live.com/proofs/AppPassword",
    helpLabel: "Create an app password",
  },
];

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

export function easyProvider(id: EasyProviderId): EasyProvider {
  const match = EASY_PROVIDERS.find((provider) => provider.id === id);
  if (!match) throw new Error(`Unknown easy provider ${id}`);
  return match;
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
