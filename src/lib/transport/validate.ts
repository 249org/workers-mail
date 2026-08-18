export type TlsMode = "implicit" | "starttls";

export type TransportSettings = {
  host: string;
  port: number;
  tls: TlsMode;
  username: string;
};

export class TransportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportConfigError";
  }
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function validateImapSettings(input: Partial<TransportSettings>): TransportSettings {
  const host = requireHost(input.host, "IMAP");
  const port = input.port ?? 993;
  const tls = input.tls ?? (port === 143 ? "starttls" : "implicit");

  if (port === 993 && tls !== "implicit") {
    throw new TransportConfigError("Port 993 expects implicit TLS.");
  }
  if (port === 143 && tls !== "starttls") {
    throw new TransportConfigError("Port 143 expects STARTTLS.");
  }
  requirePort(port);

  return { host, port, tls, username: requireUsername(input.username) };
}

export function validateSmtpSettings(input: Partial<TransportSettings>): TransportSettings {
  const host = requireHost(input.host, "SMTP");
  const port = input.port ?? 587;

  // Workers block outbound port 25 entirely, so fail here rather than on a socket timeout.
  if (port === 25) {
    throw new TransportConfigError(
      "Cloudflare Workers cannot open port 25. Use 465 (implicit TLS) or 587 (STARTTLS).",
    );
  }
  requirePort(port);

  const tls = input.tls ?? (port === 465 ? "implicit" : "starttls");
  if (port === 465 && tls !== "implicit") {
    throw new TransportConfigError("Port 465 expects implicit TLS.");
  }
  if (port === 587 && tls !== "starttls") {
    throw new TransportConfigError("Port 587 expects STARTTLS.");
  }

  return { host, port, tls, username: requireUsername(input.username) };
}

function requireHost(value: string | undefined, label: string): string {
  const host = value?.trim().toLowerCase() ?? "";
  if (!HOSTNAME.test(host)) throw new TransportConfigError(`Enter a valid ${label} hostname.`);
  return host;
}

function requirePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TransportConfigError("Port must be between 1 and 65535.");
  }
}

function requireUsername(value: string | undefined): string {
  const username = value?.trim() ?? "";
  if (!username) throw new TransportConfigError("A username is required.");
  return username;
}
