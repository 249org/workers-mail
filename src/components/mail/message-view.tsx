"use client";

import { useEffect, useState } from "react";
import { displayName, formatAddressList } from "@/lib/mail/address";
import type { MessageDetail, MessageSummary } from "@/lib/mail/queries";
import { formatBytes, formatFullDate, initialsOf } from "@/lib/format";

type Body = { html: string; blockedImages: number; text: string };

type Props = {
  mailboxId: string;
  messageId: string;
  onReply: (message: MessageDetail, mode: "reply" | "replyAll" | "forward") => void;
  onTrash: (messageId: string) => void;
  onThreadSelect: (messageId: string) => void;
};

export function MessageView({
  mailboxId,
  messageId,
  onReply,
  onTrash,
  onThreadSelect,
}: Props) {
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<MessageSummary[]>([]);
  const [body, setBody] = useState<Body | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMessage(null);
    setBody(null);
    setShowImages(false);
    setError(null);

    async function load() {
      const detail = await fetch(
        `/api/messages/${messageId}?mailbox=${encodeURIComponent(mailboxId)}`,
      );
      if (!detail.ok) {
        if (!cancelled) setError("This message could not be loaded.");
        return;
      }
      const payload = (await detail.json()) as { message: MessageDetail; thread: MessageSummary[] };
      if (cancelled) return;
      setMessage(payload.message);
      setThread(payload.thread);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mailboxId, messageId]);

  useEffect(() => {
    let cancelled = false;
    if (!message) return;

    async function loadBody() {
      const response = await fetch(
        `/api/messages/${messageId}/body?mailbox=${encodeURIComponent(mailboxId)}&images=${showImages ? "1" : "0"}`,
      );
      if (!response.ok) {
        if (!cancelled) setError("The stored copy of this message is unavailable.");
        return;
      }
      const payload = (await response.json()) as Body;
      if (!cancelled) setBody(payload);
    }

    void loadBody();
    return () => {
      cancelled = true;
    };
  }, [mailboxId, messageId, message, showImages]);

  if (error) {
    return <Placeholder>{error}</Placeholder>;
  }
  if (!message) {
    return <Placeholder>Loading…</Placeholder>;
  }

  return (
    <section className="scroll-thin flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--raised)]">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            {message.subject || "(no subject)"}
          </h1>
          <div className="flex shrink-0 gap-1.5">
            <button type="button" className="btn btn-ghost !py-1.5 text-xs" onClick={() => onReply(message, "reply")}>
              Reply
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-1.5 text-xs"
              onClick={() => onReply(message, "replyAll")}
            >
              Reply all
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-1.5 text-xs"
              onClick={() => onReply(message, "forward")}
            >
              Forward
            </button>
            <button
              type="button"
              className="btn btn-danger !py-1.5 text-xs"
              onClick={() => onTrash(message.id)}
            >
              Trash
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {initialsOf(displayName(message.from))}
          </span>
          <div className="min-w-0 text-[13px]">
            <p className="truncate">
              <span className="font-medium">{displayName(message.from)}</span>{" "}
              <span className="text-[var(--ink-faint)]">&lt;{message.from.address}&gt;</span>
            </p>
            <p className="truncate text-[var(--ink-muted)]">
              To {formatAddressList(message.to) || "undisclosed recipients"}
            </p>
            {message.cc.length > 0 && (
              <p className="truncate text-[var(--ink-muted)]">Cc {formatAddressList(message.cc)}</p>
            )}
            <p className="text-[var(--ink-faint)]">{formatFullDate(message.sentAt)}</p>
          </div>
        </div>
      </header>

      {thread.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-6 py-2">
          <span className="text-[11px] text-[var(--ink-faint)]">
            {thread.length} messages in this thread:
          </span>
          {thread.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onThreadSelect(entry.id)}
              className="badge"
              style={{
                borderColor: entry.id === message.id ? "var(--accent)" : "var(--border)",
                color: entry.id === message.id ? "var(--accent)" : "var(--ink-muted)",
              }}
            >
              {displayName(entry.from)}
            </button>
          ))}
        </div>
      )}

      {body && body.blockedImages > 0 && !showImages && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-2 text-[13px]">
          <span className="text-[var(--ink-muted)]">
            {body.blockedImages} remote image{body.blockedImages === 1 ? "" : "s"} blocked to stop
            tracking on open.
          </span>
          <button
            type="button"
            className="shrink-0 text-[var(--accent)] hover:underline"
            onClick={() => setShowImages(true)}
          >
            Show images
          </button>
        </div>
      )}

      <div className="px-6 py-5">
        {body ? (
          <div className="message-body" dangerouslySetInnerHTML={{ __html: body.html }} />
        ) : (
          <p className="text-sm text-[var(--ink-muted)]">Loading message…</p>
        )}
      </div>

      {message.attachments.filter((file) => !file.inline).length > 0 && (
        <div className="border-t border-[var(--border)] px-6 py-4">
          <p className="label">Attachments</p>
          <ul className="flex flex-wrap gap-2">
            {message.attachments
              .filter((file) => !file.inline)
              .map((file) => (
                <li key={file.id}>
                  <a
                    href={`/api/attachments/${file.id}`}
                    className="card flex items-center gap-2 px-3 py-2 text-[13px] hover:border-[var(--border-strong)]"
                    download={file.filename}
                  >
                    <span className="truncate">{file.filename}</span>
                    <span className="shrink-0 text-[var(--ink-faint)]">
                      {formatBytes(file.size)}
                    </span>
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-1 items-center justify-center bg-[var(--raised)]">
      <p className="text-sm text-[var(--ink-muted)]">{children}</p>
    </section>
  );
}
