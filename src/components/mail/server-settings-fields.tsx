"use client";

import { tlsForImapPort, tlsForSmtpPort } from "@/lib/transport/presets";

export type ServerSettings = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

type Props = {
  value: ServerSettings;
  onChange: (next: ServerSettings) => void;
};

export function ServerSettingsFields({ value, onChange }: Props) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div>
        <label className="label" htmlFor="imap-host">
          IMAP host
        </label>
        <input
          id="imap-host"
          className="field"
          placeholder="imap.one.com"
          autoComplete="off"
          spellCheck={false}
          value={value.imapHost}
          onChange={(event) => onChange({ ...value, imapHost: event.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="imap-port">
          IMAP port
        </label>
        <input
          id="imap-port"
          className="field"
          type="number"
          inputMode="numeric"
          min={1}
          max={65535}
          placeholder="993"
          value={value.imapPort || ""}
          onChange={(event) => onChange({ ...value, imapPort: Number(event.target.value) || 0 })}
        />
      </div>

      <div>
        <label className="label" htmlFor="smtp-host">
          SMTP host
        </label>
        <input
          id="smtp-host"
          className="field"
          placeholder="send.one.com"
          autoComplete="off"
          spellCheck={false}
          value={value.smtpHost}
          onChange={(event) => onChange({ ...value, smtpHost: event.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="smtp-port">
          SMTP port
        </label>
        <input
          id="smtp-port"
          className="field"
          type="number"
          inputMode="numeric"
          min={1}
          max={65535}
          placeholder="587"
          value={value.smtpPort || ""}
          onChange={(event) => onChange({ ...value, smtpPort: Number(event.target.value) || 0 })}
        />
      </div>

      <p className="col-span-2 text-[11px] text-[var(--ink-faint)]">
        Typical: IMAP 993 (TLS) or 143 (STARTTLS). SMTP 587 (STARTTLS) or 465 (TLS).
        Port 25 is blocked on Workers.
        {value.imapPort
          ? ` IMAP ${value.imapPort} will use ${tlsForImapPort(value.imapPort) === "implicit" ? "TLS" : "STARTTLS"}.`
          : ""}
        {value.smtpPort
          ? ` SMTP ${value.smtpPort} will use ${tlsForSmtpPort(value.smtpPort) === "implicit" ? "TLS" : "STARTTLS"}.`
          : ""}
      </p>
    </div>
  );
}
