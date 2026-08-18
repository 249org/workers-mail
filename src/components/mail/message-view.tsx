"use client";

import { useEffect, useState } from "react";
import { displayName, formatAddressList } from "@/lib/mail/address";
import { useMailStore } from "@/lib/mail/view-store";
import { formatBytes, formatFullDate, initialsOf } from "@/lib/format";

type Props = {
  messageId: string;
  onReply: (mode: "reply" | "replyAll" | "forward") => void;
};

export function MessageView({ messageId, onReply }: Props) {
  const loaded = useMailStore((state) => state.loaded.get(messageId));
  const load = useMailStore((state) => state.load);
  const select = useMailStore((state) => state.select);
  const trash = useMailStore((state) => state.trash);
  const star = useMailStore((state) => state.star);
  const [showImages, setShowImages] = useState(false);

  useEffect(() => {
    setShowImages(false);
  }, [messageId]);

  useEffect(() => {
    if (!loaded) void load(messageId);
  }, [loaded, load, messageId]);

  if (!loaded) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-[var(--raised)]">
        <p className="text-[13px] text-[var(--ink-muted)]">Loading</p>
      </section>
    );
  }

  const { detail, thread, body } = loaded;
  const files = detail.attachments.filter((file) => !file.inline);

  return (
    <section className="scroll-thin flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--raised)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--raised)] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">
            {detail.subject || "(no subject)"}
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <Action label="Reply" hint="R" onClick={() => onReply("reply")} />
            <Action label="Reply all" hint="A" onClick={() => onReply("replyAll")} />
            <Action label="Forward" hint="F" onClick={() => onReply("forward")} />
            <Action
              label={detail.flagged ? "Unstar" : "Star"}
              hint="S"
              onClick={() => star([detail.id], !detail.flagged)}
            />
            <Action label="Trash" hint="#" danger onClick={() => trash([detail.id])} />
          </div>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {initialsOf(displayName(detail.from))}
          </span>
          <div className="min-w-0 text-[13px]">
            <p className="truncate">
              <span className="font-medium">{displayName(detail.from)}</span>{" "}
              <span className="text-[var(--ink-faint)]">&lt;{detail.from.address}&gt;</span>
            </p>
            <p className="truncate text-[var(--ink-muted)]">
              To {formatAddressList(detail.to) || "undisclosed recipients"}
            </p>
            {detail.cc.length > 0 && (
              <p className="truncate text-[var(--ink-muted)]">
                Cc {formatAddressList(detail.cc)}
              </p>
            )}
            <p className="text-[var(--ink-faint)]">{formatFullDate(detail.sentAt)}</p>
          </div>
        </div>
      </header>

      {thread.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-6 py-2">
          <span className="text-[11px] text-[var(--ink-faint)]">
            {thread.length} in thread
          </span>
          {thread.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => select(entry.id)}
              className="badge"
              style={{
                borderColor: entry.id === detail.id ? "var(--accent)" : "var(--border)",
                color: entry.id === detail.id ? "var(--accent)" : "var(--ink-muted)",
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
            {body.blockedImages} remote image{body.blockedImages === 1 ? "" : "s"} blocked.
          </span>
          <button
            type="button"
            className="shrink-0 text-[var(--accent)] hover:underline"
            onClick={() => {
              setShowImages(true);
              void load(messageId, { allowRemoteImages: true });
            }}
          >
            Show images
          </button>
        </div>
      )}

      <div className="px-6 py-5">
        {body ? (
          <div className="message-body" dangerouslySetInnerHTML={{ __html: body.html }} />
        ) : (
          <p className="text-[13px] text-[var(--ink-muted)]">Loading message</p>
        )}
      </div>

      {files.length > 0 && (
        <div className="border-t border-[var(--border)] px-6 py-4">
          <p className="label">Attachments</p>
          <ul className="flex flex-wrap gap-2">
            {files.map((file) => (
              <li key={file.id}>
                <a
                  href={`/api/attachments/${file.id}`}
                  className="card flex items-center gap-2 px-3 py-2 text-[13px]"
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

function Action({
  label,
  hint,
  danger,
  onClick,
}: {
  label: string;
  hint: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-quiet !px-2 !py-1 text-xs"
      style={danger ? { color: "var(--danger)" } : undefined}
      title={`${label} (${hint})`}
    >
      {label}
      <span className="kbd hidden lg:inline-flex">{hint}</span>
    </button>
  );
}
