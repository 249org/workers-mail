import { domainOf, isEmailAddress } from "@/lib/mail/address";
import {
  presetFor,
  providerForMxHost,
  type TransportHosts,
} from "@/lib/transport/presets";

const DOH = "https://cloudflare-dns.com/dns-query";
const ISPDB = "https://autoconfig.thunderbird.net/v1.1";
const MAX_BODY_BYTES = 48_000;
const FETCH_MS = 2_500;

export type DiscoverSource = "directory" | "srv" | "autoconfig" | "ispdb" | "mx";

export type DiscoverResult =
  | ({
      found: true;
      provider: string;
      source: DiscoverSource;
      detail: string;
    } & TransportHosts)
  | { found: false; detail: string };

export type DiscoverDeps = {
  fetch?: typeof fetch;
};

type TransportDraft = {
  host?: string;
  port?: number;
  tls?: "implicit" | "starttls";
  username?: string;
  password?: string;
};

/**
 * Resolve IMAP/SMTP the way Outlook and Thunderbird do: published config and
 * observed MX, never `imap.{the-address-domain}`.
 */
export async function discoverMailServers(
  address: string,
  deps: DiscoverDeps = {},
): Promise<DiscoverResult> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!isEmailAddress(address)) {
    return { found: false, detail: "Enter a valid email address." };
  }

  const domain = domainOf(address);
  const directory = presetFor(address);
  if (directory) {
    return hit(directory.name, "directory", `Known settings for ${domain}`, directory);
  }

  const [srv, autoconfig, wellKnown, ispdb, mxHosts] = await Promise.all([
    lookupSrv(domain, fetchImpl),
    fetchClientConfig(`https://autoconfig.${domain}/mail/config-v1.1.xml`, fetchImpl),
    fetchClientConfig(
      `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
      fetchImpl,
    ),
    fetchClientConfig(`${ISPDB}/${domain}`, fetchImpl),
    lookupMx(domain, fetchImpl),
  ]);

  if (srv) {
    return {
      found: true,
      provider: domain,
      source: "srv",
      detail: `SRV records on ${domain}`,
      ...srv,
    };
  }
  if (autoconfig) {
    return configHit(autoconfig, "autoconfig", `Published autoconfig for ${domain}`);
  }
  if (wellKnown) {
    return configHit(wellKnown, "autoconfig", `Published autoconfig for ${domain}`);
  }
  if (ispdb) {
    return configHit(ispdb, "ispdb", `Mozilla ISP database for ${domain}`);
  }

  for (const mxHost of mxHosts) {
    const provider = providerForMxHost(mxHost);
    if (provider) {
      return hit(
        provider.name,
        "mx",
        `MX ${mxHost} is hosted by ${provider.name}`,
        provider,
      );
    }
  }

  const tried = new Set([domain]);
  for (const mxHost of mxHosts) {
    for (const candidate of mxOrgCandidates(mxHost)) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      const config = await fetchClientConfig(`${ISPDB}/${candidate}`, fetchImpl);
      if (config) {
        return configHit(config, "ispdb", `MX ${mxHost} → ${candidate}`);
      }
    }
  }

  return {
    found: false,
    detail: `No IMAP settings published for ${domain}. Enter the host and port.`,
  };
}

/** Fill blank hosts from discovery; leave anything the caller already set. */
export async function applyDiscoveredHosts(
  address: string,
  imap: TransportDraft,
  smtp: TransportDraft,
  deps: DiscoverDeps = {},
): Promise<{ imap: TransportDraft; smtp: TransportDraft }> {
  if (imap.host?.trim() && smtp.host?.trim()) return { imap, smtp };
  const discovered = await discoverMailServers(address, deps);
  if (!discovered.found) return { imap, smtp };
  return {
    imap: {
      ...imap,
      host: imap.host?.trim() || discovered.imapHost,
      port: imap.port || discovered.imapPort,
    },
    smtp: {
      ...smtp,
      host: smtp.host?.trim() || discovered.smtpHost,
      port: smtp.port || discovered.smtpPort,
    },
  };
}

export function mxOrgCandidates(mxHost: string): string[] {
  const labels = mxHost.replace(/\.$/, "").trim().toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return [];
  const two = labels.slice(-2).join(".");
  const three = labels.length >= 3 ? labels.slice(-3).join(".") : null;
  return three && three !== two ? [two, three] : [two];
}

function hit(
  provider: string,
  source: DiscoverSource,
  detail: string,
  preset: TransportHosts,
): DiscoverResult {
  return {
    found: true,
    provider,
    source,
    detail,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
  };
}

function configHit(
  hosts: TransportHosts & { provider?: string },
  source: DiscoverSource,
  detail: string,
): DiscoverResult {
  return {
    found: true,
    provider: hosts.provider || hosts.imapHost,
    source,
    detail,
    imapHost: hosts.imapHost,
    imapPort: hosts.imapPort,
    smtpHost: hosts.smtpHost,
    smtpPort: hosts.smtpPort,
  };
}

async function lookupMx(domain: string, fetchImpl: typeof fetch): Promise<string[]> {
  const records = await doh(domain, "MX", fetchImpl);
  return records
    .map(parseMx)
    .filter((row): row is { priority: number; host: string } => row !== null)
    .sort((a, b) => a.priority - b.priority)
    .map((row) => row.host);
}

async function lookupSrv(
  domain: string,
  fetchImpl: typeof fetch,
): Promise<TransportHosts | null> {
  const [imaps, imap, submissions, submission] = await Promise.all([
    doh(`_imaps._tcp.${domain}`, "SRV", fetchImpl),
    doh(`_imap._tcp.${domain}`, "SRV", fetchImpl),
    doh(`_submissions._tcp.${domain}`, "SRV", fetchImpl),
    doh(`_submission._tcp.${domain}`, "SRV", fetchImpl),
  ]);

  const incoming = parseSrv(imaps[0] ?? "") ?? parseSrv(imap[0] ?? "");
  const outgoing = parseSrv(submissions[0] ?? "") ?? parseSrv(submission[0] ?? "");
  if (!incoming || !outgoing) return null;
  if (outgoing.port === 25) return null;
  if (!plausibleHost(incoming.host) || !plausibleHost(outgoing.host)) return null;

  return {
    imapHost: incoming.host,
    imapPort: incoming.port || 993,
    smtpHost: outgoing.host,
    smtpPort: outgoing.port || 587,
  };
}

async function doh(name: string, type: "MX" | "SRV", fetchImpl: typeof fetch): Promise<string[]> {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const body = await fetchLimited(url, fetchImpl, { accept: "application/dns-json" });
  if (!body) return [];
  try {
    const parsed = JSON.parse(body) as { Answer?: Array<{ data?: string }> };
    return (parsed.Answer ?? []).map((answer) => answer.data ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchClientConfig(
  url: string,
  fetchImpl: typeof fetch,
): Promise<(TransportHosts & { provider?: string }) | null> {
  const xml = await fetchLimited(url, fetchImpl, { accept: "application/xml, text/xml" });
  if (!xml) return null;
  return parseClientConfig(xml);
}

export function parseClientConfig(xml: string): (TransportHosts & { provider?: string }) | null {
  const incoming = block(xml, "incomingServer", "imap");
  const outgoing = block(xml, "outgoingServer", "smtp");
  if (!incoming || !outgoing) return null;

  const imapHost = tag(incoming, "hostname");
  const smtpHost = tag(outgoing, "hostname");
  const imapPort = Number(tag(incoming, "port"));
  const smtpPort = Number(tag(outgoing, "port"));
  if (!imapHost || !smtpHost || !plausibleHost(imapHost) || !plausibleHost(smtpHost)) return null;
  if (!Number.isInteger(imapPort) || !Number.isInteger(smtpPort)) return null;
  if (smtpPort === 25) return null;

  const provider =
    xml.match(/<emailProvider[^>]*id="([^"]+)"/i)?.[1] ?? imapHost.split(".").slice(-2).join(".");

  return {
    provider,
    imapHost: imapHost.toLowerCase(),
    imapPort,
    smtpHost: smtpHost.toLowerCase(),
    smtpPort,
  };
}

function block(xml: string, tagName: string, type: string): string | null {
  const pattern = new RegExp(
    `<${tagName}[^>]*type="${type}"[^>]*>([\\s\\S]*?)</${tagName}>`,
    "i",
  );
  return xml.match(pattern)?.[1] ?? null;
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, "i"));
  const value = match?.[1]?.trim();
  return value || null;
}

function parseMx(data: string): { priority: number; host: string } | null {
  const trimmed = data.trim();
  const withPriority = trimmed.match(/^(\d+)\s+(\S+)$/);
  const host = (withPriority?.[2] ?? trimmed).replace(/\.$/, "").toLowerCase();
  if (!plausibleHost(host)) return null;
  return { priority: Number(withPriority?.[1] ?? 0), host };
}

function parseSrv(data: string): { host: string; port: number } | null {
  const match = data.trim().match(/^\d+\s+\d+\s+(\d+)\s+(\S+)$/);
  if (!match) return null;
  const host = match[2]?.replace(/\.$/, "").toLowerCase() ?? "";
  const port = Number(match[1]);
  if (!plausibleHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function plausibleHost(value: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(value);
}

async function fetchLimited(
  url: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_MS),
      headers,
    });
    if (!response.ok) return null;
    const announced = Number(response.headers.get("content-length") ?? 0);
    if (announced > MAX_BODY_BYTES) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BODY_BYTES) return null;
    return new TextDecoder().decode(buffer);
  } catch {
    return null;
  }
}
