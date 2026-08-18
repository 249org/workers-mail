"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { formatBytes } from "@/lib/format";

export type ComposeDraft = {
  draftId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
};

type Props = {
  mailbox: PublicMailbox;
  mailboxes: PublicMailbox[];
  draft: ComposeDraft;
  onMailboxChange: (mailboxId: string) => void;
  onClose: () => void;
  onSent: () => void;
};

const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const AUTOSAVE_MS = 4_000;

export function ComposeDialog({
  mailbox,
  mailboxes,
  draft,
  onMailboxChange,
  onClose,
  onSent,
}: Props) {
  const [form, setForm] = useState(draft);
  const [files, setFiles] = useState<File[]>([]);
  const [showCc, setShowCc] = useState(Boolean(draft.cc || draft.bcc));
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const draftId = useRef(draft.draftId);

  useEffect(() => {
    setForm(draft);
    draftId.current = draft.draftId;
  }, [draft]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useHotkeys("modal", {
    send: () => void send(),
    back: onClose,
  });

  useEffect(() => {
    if (!form.to && !form.subject && !form.text) return;
    const timer = setTimeout(() => void saveDraft(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.to, form.cc, form.subject, form.text]);

  async function saveDraft() {
    const response = await fetch("/api/drafts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: draftId.current,
        mailboxId: mailbox.id,
        to: form.to,
        cc: form.cc,
        subject: form.subject,
        text: form.text,
        inReplyTo: form.inReplyTo,
        threadId: form.threadId,
      }),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { id: string };
    draftId.current = payload.id;
    setStatus("Draft saved");
  }

  async function send() {
    setSending(true);
    setStatus(null);

    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setStatus(`Attachments total ${formatBytes(total)}; the limit is 15 MB.`);
      setSending(false);
      return;
    }

    const attachments = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64: await toBase64(file),
      })),
    );

    const response = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mailboxId: mailbox.id,
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        subject: form.subject,
        text: form.text,
        inReplyTo: form.inReplyTo,
        references: form.references,
        draftId: draftId.current,
        attachments,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error ?? "The message could not be sent.");
      setSending(false);
      return;
    }

    onSent();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Compose message"
    >
      <div className="overlay-backdrop absolute inset-0" data-open={mounted} />
      <div
        className="overlay-panel card relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden"
        data-open={mounted}
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold">New message</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
            aria-label="Close compose"
          >
            Close
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <Row label="From">
            <select
              className="field !py-1.5"
              value={mailbox.id}
              onChange={(event) => onMailboxChange(event.target.value)}
            >
              {mailboxes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName ? `${entry.displayName} <${entry.address}>` : entry.address}
                </option>
              ))}
            </select>
          </Row>

          <Row label="To">
            <div className="flex gap-2">
              <input
                className="field !py-1.5"
                value={form.to}
                autoFocus
                onChange={(event) => setForm({ ...form, to: event.target.value })}
                placeholder="name@example.com, another@example.com"
              />
              {!showCc && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-[var(--accent)]"
                  onClick={() => setShowCc(true)}
                >
                  Cc/Bcc
                </button>
              )}
            </div>
          </Row>

          {showCc && (
            <>
              <Row label="Cc">
                <input
                  className="field !py-1.5"
                  value={form.cc}
                  onChange={(event) => setForm({ ...form, cc: event.target.value })}
                />
              </Row>
              <Row label="Bcc">
                <input
                  className="field !py-1.5"
                  value={form.bcc}
                  onChange={(event) => setForm({ ...form, bcc: event.target.value })}
                />
              </Row>
            </>
          )}

          <Row label="Subject">
            <input
              className="field !py-1.5"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
            />
          </Row>

          <textarea
            className="field mt-2 min-h-64 resize-y font-[inherit] leading-relaxed"
            value={form.text}
            onChange={(event) => setForm({ ...form, text: event.target.value })}
            placeholder="Write your message…"
          />

          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="badge">
                  {file.name} · {formatBytes(file.size)}
                  <button
                    type="button"
                    className="ml-1 text-[var(--danger)]"
                    onClick={() => setFiles(files.filter((_, position) => position !== index))}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-3">
          <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? "Sending" : "Send"}
            <span className="kbd" style={{ background: "transparent", color: "inherit", opacity: 0.75 }}>
              ⌘↵
            </span>
          </button>
          <label className="btn btn-ghost cursor-pointer text-xs">
            Attach
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                setFiles([...files, ...Array.from(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="btn btn-ghost text-xs" onClick={() => void saveDraft()}>
            Save draft
          </button>
          {status && <span className="ml-auto text-xs text-[var(--ink-muted)]">{status}</span>}
        </footer>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-[var(--ink-muted)]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}
