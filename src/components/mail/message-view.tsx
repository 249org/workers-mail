"use client";

import { useEffect, useState } from "react";
import { displayName, formatAddressList } from "@/lib/mail/address";
import { useMailStore } from "@/lib/mail/view-store";
import { formatBytes, formatFullDate, initialsOf } from "@/lib/format";
import { ChromeButton } from "./chrome-button";

type Props = {
  messageId: string;
  onReply: (mode: "reply" | "replyAll" | "forward") => void;
  listHidden: boolean;
  onToggleList: () => void;
};

export function MessageView({ messageId, onReply, listHidden, onToggleList }: Props) {
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

  const pad = listHidden ? "px-8 md:px-10" : "px-4";

  if (!loaded) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-card">
        <div className={`pane-toolbar border-b border-border`} data-wide={listHidden ? "" : undefined}>
          <ChromeButton
            icon={listHidden ? "list" : "expand"}
            label={listHidden ? "Show message list" : "Read full width"}
            hint="]"
            pressed={listHidden}
            onClick={onToggleList}
          />
          <p className="text-[13px] text-muted-foreground">Loading</p>
        </div>
      </section>
    );
  }

  const { detail, thread, body } = loaded;
  const files = detail.attachments.filter((file) => !file.inline);

  return (
    <section className="scroll-thin flex min-w-0 flex-1 flex-col overflow-y-auto bg-card">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="pane-toolbar" data-wide={listHidden ? "" : undefined}>
          <ChromeButton
            icon={listHidden ? "list" : "expand"}
            label={listHidden ? "Show message list" : "Read full width"}
            hint="]"
            pressed={listHidden}
            onClick={onToggleList}
          />
          <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em]">
            {detail.subject || "(no subject)"}
          </h1>
          <div className="flex shrink-0 items-center">
            <ChromeButton icon="reply" label="Reply" hint="R" onClick={() => onReply("reply")} />
            <ChromeButton icon="replyAll" label="Reply all" hint="A" onClick={() => onReply("replyAll")} />
            <ChromeButton icon="forward" label="Forward" hint="F" onClick={() => onReply("forward")} />
            <ChromeButton
              icon="star"
              label={detail.flagged ? "Unstar" : "Star"}
              hint="S"
              onClick={() => star([detail.id], !detail.flagged)}
            />
            <ChromeButton
              icon="trash"
              label="Move to trash"
              hint="#"
              danger
              end
              onClick={() => trash([detail.id])}
            />
          </div>
        </div>

        <div className={`flex items-start gap-3 pb-3 ${pad}`}>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold"
            style={{ background: "var(--highlight-subtle)", color: "var(--highlight)" }}
          >
            {initialsOf(displayName(detail.from))}
          </span>
          <div className="min-w-0 text-[13px]">
            <p className="truncate">
              <span className="font-medium">{displayName(detail.from)}</span>{" "}
              <span className="text-muted-foreground">&lt;{detail.from.address}&gt;</span>
            </p>
            <p className="truncate text-muted-foreground">
              To {formatAddressList(detail.to) || "undisclosed recipients"}
            </p>
            {detail.cc.length > 0 && (
              <p className="truncate text-muted-foreground">
                Cc {formatAddressList(detail.cc)}
              </p>
            )}
            <p className="text-muted-foreground">{formatFullDate(detail.sentAt)}</p>
          </div>
        </div>
      </header>

      {thread.length > 1 && (
        <div className={`flex flex-wrap items-center gap-1.5 border-b border-border py-2 ${pad}`}>
          <span className="text-[13px] text-muted-foreground">{thread.length} in thread</span>
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
        <div className={`flex items-center justify-between gap-3 border-b border-border bg-secondary py-2 text-[13px] ${pad}`}>
          <span className="text-muted-foreground">
            {body.blockedImages} remote image{body.blockedImages === 1 ? "" : "s"} blocked.
          </span>
          <button
            type="button"
            className="shrink-0 text-primary hover:underline"
            onClick={() => {
              setShowImages(true);
              void load(messageId, { allowRemoteImages: true });
            }}
          >
            Show images
          </button>
        </div>
      )}

      <div className={`py-5 ${pad}`}>
        {body ? (
          <div className="message-body" dangerouslySetInnerHTML={{ __html: body.html }} />
        ) : (
          <p className="text-[13px] text-muted-foreground">Loading message</p>
        )}
      </div>

      {files.length > 0 && (
        <div className={`border-t border-border py-4 ${pad}`}>
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
                  <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
