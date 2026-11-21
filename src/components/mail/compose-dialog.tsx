"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  formatHtml,
  htmlToText,
  switchFormat,
  textToHtml,
  type BodyFormat,
  type FormatMemo,
} from "@/lib/mail/compose-html";
import { toEmailHtml } from "@/lib/mail/email-html";
import { base64Bytes, extractInlineImages, type InlineImage } from "@/lib/mail/inline-images";
import { EditorIcon } from "./editor-icons";
import { PreviewFrame } from "./preview-frame";

// The editor is most of what compose weighs, so it loads the first time it is asked for.
const RichEditor = dynamic(() => import("./rich-editor").then((module) => module.RichEditor), {
  ssr: false,
  loading: () => <div className="rich-editor rich-loading" aria-busy="true" />,
});

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

/* Per-browser preferences: how the last message was written, and at what size. */
const FORMAT_KEY = "workers-mail.compose.format";
const EXPANDED_KEY = "workers-mail.compose.expanded";

const FORMAT_LABEL: Record<BodyFormat, string> = { text: "Plain text", rich: "Rich text", html: "HTML" };

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be refused; the choice simply is not remembered.
  }
}
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
  const [expanded, setExpanded] = useState(false);
  const formatMemo = useRef<FormatMemo>(null);
  const preferenceApplied = useRef(false);
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
    // Full page, Escape steps back to the dialog rather than throwing the message away.
    back: () => (expanded ? toggleExpanded() : onClose()),
  });

  useEffect(() => {
    setExpanded(readPreference(EXPANDED_KEY) === "1");
  }, []);

  /*
   * A new message opens in the format the last one was written in, the rich editor if
   * there was none. It waits for the signature, which is added to the typed text, so the
   * converted body carries it.
   */
  useEffect(() => {
    if (preferenceApplied.current || !signatureReady) return;
    preferenceApplied.current = true;
    const remembered = readPreference(FORMAT_KEY);
    const preferred: BodyFormat = remembered === "text" ? "text" : "rich";
    if (preferred !== "text") chooseFormat(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureReady]);

  // Text changing underneath an untouched converted body — the signature, a new draft —
  // is carried into it. Once the body has been edited it is left alone.
  useEffect(() => {
    const memo = formatMemo.current;
    if (format === "text" || !memo || memo.html !== html || memo.text === form.text) return;
    const next = textToHtml(form.text);
    formatMemo.current = { text: form.text, html: next };
    setForm((current) => ({ ...current, html: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.text]);

  function toggleExpanded() {
    setExpanded((current) => {
      writePreference(EXPANDED_KEY, current ? "0" : "1");
      return !current;
    });
  }

  useEffect(() => {
    if (!form.to && !form.subject && !form.text && !form.html) return;
    const timer = setTimeout(() => void saveDraft(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.to, form.cc, form.subject, form.text, form.html, form.format]);

  function chooseFormat(next: BodyFormat) {
    if (next === format) return;
    // Rich or plain is a way of writing; hand-written HTML is a choice for one message,
    // and opening every later reply as code because one newsletter was pasted is not.
    if (next !== "html") writePreference(FORMAT_KEY, next);
    setView("write");

    // The editor and the code are the same HTML. The code is shown with the inline
    // styles a mail client needs written in, because that is what will be sent.
    if (format !== "text" && next !== "text") {
      const nextHtml = next === "html" && html ? formatHtml(toEmailHtml(html)) : html;
      if (formatMemo.current?.html === html) formatMemo.current = { ...formatMemo.current, html: nextHtml };
      setForm((current) => ({ ...current, html: nextHtml, format: next }));
      return;
    }

    const moved = switchFormat({ text: form.text, html }, next, formatMemo.current);
    formatMemo.current = moved.memo;
    setForm((current) => ({ ...current, text: moved.text, html: moved.html, format: next }));
  }

  /*
   * What goes out. The plain-text copy is read off the same HTML, so the two never say
   * different things, and pictures in the document travel as attachments it points at.
   */
  function outgoingBody(): { text: string; html?: string; images: InlineImage[] } {
    if (format === "text") return { text: form.text, images: [] };
    const source = format === "rich" ? toEmailHtml(html) : html;
    const { html: withImages, images } = extractInlineImages(source);
    return { text: htmlToText(source), html: asHtmlDocument(withImages), images };
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

    const { images, ...body } = outgoingBody();
    const total =
      files.reduce((sum, file) => sum + file.size, 0) +
      images.reduce((sum, image) => sum + base64Bytes(image.contentBase64), 0);
    if (total > MAX_TOTAL_BYTES) {
      setStatus(`Attachments and pictures total ${formatBytes(total)}; the limit is 15 MB.`);
      setSending(false);
      return;
    }

    const attachments = [
      ...(await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: await toBase64(file),
        })),
      )),
      ...images.map((image) => ({
        filename: image.filename,
        mimeType: image.mimeType,
        contentBase64: image.contentBase64,
        inline: true,
        contentId: image.contentId,
      })),
    ];

    const response = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mailboxId: mailbox.id,
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        subject: form.subject,
        ...body,
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

  // What the rich editor's preview shows is exactly what will be sent: the inline styles
  // included, which is where most of the difference from the editor would show.
  const previewHtml = useMemo(
    () => (format === "rich" && view === "preview" ? toEmailHtml(html) : ""),
    [format, view, html],
  );

  const taken = parseAddressList([form.to, form.cc, form.bcc].filter(Boolean).join(", ")).map(
    (addr) => addr.address,
  );

  return (
    <div
      className="compose-shell fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      data-expanded={expanded ? "" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="overlay-backdrop absolute inset-0" data-open={mounted} />
      <div
        className="compose-sheet overlay-panel panel relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden max-md:h-full max-md:max-h-none max-md:rounded-none"
        data-open={mounted}
        data-expanded={expanded ? "" : undefined}
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleExpanded}
              className="btn btn-quiet btn-icon !h-7 !w-7 tip max-md:hidden"
              data-tip={expanded ? "Back to a window  Esc" : "Full page"}
              aria-label={expanded ? "Exit full page" : "Full page"}
              aria-pressed={expanded}
            >
              <EditorIcon name={expanded ? "collapse" : "expand"} size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-quiet !h-7 !px-2 text-[13px]"
              aria-label="Close compose"
            >
              Close
            </button>
          </div>
        </header>

        <div className="compose-body scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <form className="compose-form" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
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
              {(["rich", "text", "html"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={format === option}
                  className="scheme-toggle-btn"
                  onClick={() => chooseFormat(option)}
                >
                  {FORMAT_LABEL[option]}
                </button>
              ))}
            </div>
            {format !== "text" ? (
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
                <div className="scheme-toggle" role="tablist" aria-label="Message body">
                  {(["write", "preview"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={view === option}
                      className="scheme-toggle-btn"
                      onClick={() => setView(option)}
                    >
                      {option === "preview" ? "Preview" : format === "html" ? "Code" : "Write"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {format === "html" && view === "preview" ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Click into the preview to change the words. The layout stays exactly as written.
            </p>
          ) : null}

          {format === "text" ? (
            <textarea
              className="compose-grow field mt-2 min-h-64 resize-y font-[inherit] leading-relaxed"
              value={form.text}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              placeholder="Write your message…"
              aria-label="Message"
            />
          ) : view === "preview" ? (
            <PreviewFrame
              html={format === "rich" ? previewHtml : html}
              editable={format === "html"}
              width={previewWidth === "phone" ? PHONE_PREVIEW_PX : "100%"}
              onEdit={(next) => setForm((current) => ({ ...current, html: next }))}
              onSend={() => void send()}
            />
          ) : format === "rich" ? (
            <RichEditor
              html={html}
              expanded={expanded}
              onChange={(next) => setForm((current) => ({ ...current, html: next }))}
              onError={setStatus}
            />
          ) : (
            <textarea
              className="compose-grow field mt-2 min-h-64 resize-y font-mono text-[12.5px] leading-relaxed"
              value={html}
              onChange={(event) => setForm({ ...form, html: event.target.value })}
              placeholder="<p>Hello,</p>"
              aria-label="HTML source"
              spellCheck={false}
            />
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
