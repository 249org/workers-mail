"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicMailbox } from "@/lib/mail/mailboxes";
import { avatarSrc } from "@/lib/mail/profile-photo";
import { useHotkeys } from "@/lib/keyboard/use-hotkeys";
import { formatBytes } from "@/lib/format";
import { PersonAvatar } from "../person-avatar";
import { AddressField } from "./address-field";
import { parseAddressList } from "@/lib/mail/address";
import { type SuggestContact } from "@/lib/mail/contact-match";
import {
  applySignature,
  shouldIncludeSignature,
  signatureText,
} from "@/lib/signature";
import { useSignatureStore } from "@/lib/signature-store";
import {
  asHtmlDocument,
  htmlToText,
  previewDocument,
  switchFormat,
  type BodyFormat,
  type FormatMemo,
} from "@/lib/mail/compose-html";

export type ComposeDraft = {
  draftId?: string;
  mode?: "compose" | "reply" | "replyAll" | "forward";
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html?: string;
  format?: BodyFormat;
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

const MODE_LABEL: Record<NonNullable<ComposeDraft["mode"]>, string> = {
  compose: "New message",
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
};
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
/** A common phone width, so a newsletter's narrow layout can be checked before it goes. */
const PHONE_PREVIEW_PX = 375;
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
  const format: BodyFormat = form.format ?? "text";
  const html = form.html ?? "";
  const [view, setView] = useState<"write" | "preview">("write");
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "phone">("desktop");
  const formatMemo = useRef<FormatMemo>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [showCc, setShowCc] = useState(Boolean(draft.cc || draft.bcc));
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [avatarAt, setAvatarAt] = useState<number | null>(null);
  const [contacts, setContacts] = useState<SuggestContact[]>([]);
  const draftId = useRef(draft.draftId);
  const lastDraft = useRef(draft);
  const title = MODE_LABEL[draft.mode ?? "compose"];
  const signaturePrefs = useSignatureStore((state) => state.prefs);
  const signatureReady = useSignatureStore((state) => state.ready);
  const hydrateSignature = useSignatureStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateSignature();
  }, [hydrateSignature]);

  useEffect(() => {
    void fetch("/api/account")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const updatedAt = (payload as { avatarUpdatedAt?: number | null } | null)?.avatarUpdatedAt;
        if (updatedAt) setAvatarAt(updatedAt);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    void fetch("/api/contacts")
      .then((response) => (response.ok ? response.json() : { contacts: [] }))
      .then((payload) => {
        if (live) setContacts((payload as { contacts?: SuggestContact[] }).contacts ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const draftChanged = lastDraft.current !== draft;
    lastDraft.current = draft;
    draftId.current = draft.draftId;

    setForm((current) => {
      const source = draftChanged ? draft : current;
      if (!signatureReady) return source;
      const include = shouldIncludeSignature(signaturePrefs, source.mode);
      const text = applySignature(
        source.text,
        include ? signatureText(signaturePrefs, mailbox.id) : "",
      );
      if (text === source.text && source === current) return current;
      return { ...source, text };
    });
  }, [draft, mailbox.id, signaturePrefs, signatureReady]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useHotkeys("modal", {
    send: () => void send(),
    back: onClose,
  });

  useEffect(() => {
    if (!form.to && !form.subject && !form.text && !form.html) return;
    const timer = setTimeout(() => void saveDraft(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.to, form.cc, form.subject, form.text, form.html, form.format]);

  function chooseFormat(next: BodyFormat) {
    if (next === format) return;
    const moved = switchFormat({ text: form.text, html }, next, formatMemo.current);
    formatMemo.current = moved.memo;
    setForm({ ...form, text: moved.text, html: moved.html, format: next });
    setView("write");
  }

  /*
   * What goes out. In HTML the typed source is the message and the plain-text copy is
   * read off it, so the two can never say different things.
   */
  function outgoingBody(): { text: string; html?: string } {
    if (format !== "html") return { text: form.text };
    return { text: htmlToText(html), html: asHtmlDocument(html) };
  }

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
        // The Drafts list shows a snippet, which should read as words rather than tags.
        text: outgoingBody().text,
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
        ...outgoingBody(),
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

  const taken = parseAddressList([form.to, form.cc, form.bcc].filter(Boolean).join(", ")).map(
    (addr) => addr.address,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="overlay-backdrop absolute inset-0" data-open={mounted} />
      <div
        className="overlay-panel panel relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden max-md:h-full max-md:max-h-none max-md:rounded-none"
        data-open={mounted}
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
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
          <form autoComplete="off" onSubmit={(event) => event.preventDefault()}>
          <Row label="From">
            <div className="flex items-center gap-2">
              <PersonAvatar
                name={mailbox.displayName || mailbox.address}
                src={avatarSrc(avatarAt)}
              />
              <select
                className="field min-w-0 flex-1 !py-1.5"
                value={mailbox.id}
                onChange={(event) => onMailboxChange(event.target.value)}
              >
                {mailboxes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName ? `${entry.displayName} <${entry.address}>` : entry.address}
                  </option>
                ))}
              </select>
            </div>
          </Row>

          <Row label="To">
            <div className="flex gap-2">
              <AddressField
                value={form.to}
                contacts={contacts}
                taken={taken}
                autoFocus
                placeholder="name@example.com, another@example.com"
                aria-label="To"
                onChange={(to) => setForm({ ...form, to })}
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
                <AddressField
                  value={form.cc}
                  contacts={contacts}
                  taken={taken}
                  aria-label="Cc"
                  onChange={(cc) => setForm({ ...form, cc })}
                />
              </Row>
              <Row label="Bcc">
                <AddressField
                  value={form.bcc}
                  contacts={contacts}
                  taken={taken}
                  aria-label="Bcc"
                  onChange={(bcc) => setForm({ ...form, bcc })}
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

          <div className="compose-body-bar">
            <div className="scheme-toggle" role="radiogroup" aria-label="Message format">
              {(["text", "html"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={format === option}
                  className="scheme-toggle-btn"
                  onClick={() => chooseFormat(option)}
                >
                  {option === "text" ? "Plain text" : "HTML"}
                </button>
              ))}
            </div>
            {format === "html" ? (
              <div className="ml-auto flex items-center gap-2">
                {view === "preview" ? (
                  <div className="scheme-toggle" role="radiogroup" aria-label="Preview width">
                    {(["desktop", "phone"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={previewWidth === option}
                        className="scheme-toggle-btn"
                        onClick={() => setPreviewWidth(option)}
                      >
                        {option === "desktop" ? "Desktop" : "Phone"}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="scheme-toggle" role="tablist" aria-label="HTML body">
                  {(["write", "preview"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={view === option}
                      className="scheme-toggle-btn"
                      onClick={() => setView(option)}
                    >
                      {option === "write" ? "Write" : "Preview"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {format === "text" ? (
            <textarea
              className="field mt-2 min-h-64 resize-y font-[inherit] leading-relaxed"
              value={form.text}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              placeholder="Write your message…"
              aria-label="Message"
            />
          ) : view === "write" ? (
            <textarea
              className="field mt-2 min-h-64 resize-y font-mono text-[12.5px] leading-relaxed"
              value={html}
              onChange={(event) => setForm({ ...form, html: event.target.value })}
              placeholder="<p>Hello,</p>"
              aria-label="HTML source"
              spellCheck={false}
            />
          ) : (
            <div className="compose-preview">
              {/*
                Sandboxed with no scripts and no origin of its own: whatever the HTML holds, it
                runs nowhere and reaches nothing in the app. Popups are allowed only so a link
                can be followed into a new tab.
              */}
              <iframe
                title="Preview of the message"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={previewDocument(html)}
                style={{ width: previewWidth === "phone" ? PHONE_PREVIEW_PX : "100%" }}
              />
            </div>
          )}
          </form>

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

        <footer className="frost-bar flex flex-wrap items-center gap-3 px-4 py-3">
          <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? "Sending" : "Send"}
            <span className="kbd max-md:hidden" style={{ background: "transparent", color: "inherit", opacity: 0.75 }}>
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
    <div className="mb-2 flex items-center gap-3 max-md:flex-col max-md:items-stretch max-md:gap-1">
      <span className="w-14 shrink-0 text-xs text-[var(--ink-muted)] max-md:w-auto">{label}</span>
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
