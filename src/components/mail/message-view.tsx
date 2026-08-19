"use client";

import { useEffect, useState } from "react";
import { displayName, formatAddressList } from "@/lib/mail/address";
import { addressAvatarSrc } from "@/lib/mail/profile-photo";
import { useMailStore } from "@/lib/mail/view-store";
import { usePrivacyStore } from "@/lib/privacy-store";
import { formatBytes, formatFullDate } from "@/lib/format";
import { toast } from "sonner";
import { ChromeButton } from "./chrome-button";
import { useContextMenu } from "@/components/ui/context-menu";
import { PersonAvatar } from "../person-avatar";

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
  const deleteForever = useMailStore((state) => state.deleteForever);
  const folders = useMailStore((state) => state.folders);
  const folderId = useMailStore((state) => state.folderId);
  const inTrash = folders.find((folder) => folder.id === folderId)?.role === "trash";
  const star = useMailStore((state) => state.star);
  const remoteImages = usePrivacyStore((state) => state.prefs.remoteImages);
  const [showImages, setShowImages] = useState(false);
  const { bind: bindReaderMenu } = useContextMenu();

  useEffect(() => {
    setShowImages(remoteImages === "allow");
  }, [messageId, remoteImages]);

  useEffect(() => {
    if (!loaded) void load(messageId, { allowRemoteImages: remoteImages === "allow" });
  }, [loaded, load, messageId, remoteImages]);

  const chromePad = listHidden ? "px-4 md:px-10" : "px-4";

  if (!loaded) {
    return (
      <section className="mail-reader flex min-w-0 flex-1 flex-col bg-card">
        <div className="pane-toolbar border-b border-border" data-wide={listHidden ? "" : undefined}>
          <ChromeButton
            icon={listHidden ? "list" : "expand"}
            label={listHidden ? "Show message list" : "Read full width"}
            hint="]"
            start
            pressed={listHidden}
            onClick={onToggleList}
          />
          <p className="text-[13px] text-muted-foreground">Loading</p>
        </div>
        <div className="message-sheet" aria-hidden>
          <div className="message-skeleton" />
          <div className="message-skeleton message-skeleton-short" />
          <div className="message-skeleton" />
        </div>
      </section>
    );
  }

  const { detail, thread, body } = loaded;
  const files = detail.attachments.filter((file) => !file.inline && !file.contentId);
  const sentAt = new Date(detail.sentAt * 1000);

  const readerMenuItems = [
    {
      type: "item" as const,
      label: "Reply",
      onSelect: () => onReply("reply"),
    },
    {
      type: "item" as const,
      label: "Reply all",
      onSelect: () => onReply("replyAll"),
    },
    {
      type: "item" as const,
      label: "Forward",
      onSelect: () => onReply("forward"),
    },
    { type: "separator" as const },
    {
      type: "item" as const,
      label: detail.flagged ? "Unstar" : "Star",
      onSelect: () => star([detail.id], !detail.flagged),
    },
    {
      type: "item" as const,
      label: inTrash ? "Delete forever" : "Move to trash",
      danger: true,
      onSelect: () => {
        if (inTrash) {
          deleteForever([detail.id]);
          toast("Deleted forever");
        } else {
          trash([detail.id]);
        }
      },
    },
    { type: "separator" as const },
    {
      type: "item" as const,
      label: "Copy subject",
      onSelect: () => { void navigator.clipboard.writeText(detail.subject ?? ""); toast("Copied"); },
    },
    {
      type: "item" as const,
      label: "Copy sender address",
      onSelect: () => { void navigator.clipboard.writeText(detail.from.address); toast("Copied"); },
    },
  ];

  return (
    <section
      className="mail-reader flex min-w-0 flex-1 flex-col bg-card"
      {...bindReaderMenu(readerMenuItems)}
    >
      <header className="z-[21] shrink-0 border-b border-border bg-card">
        <div className="pane-toolbar" data-wide={listHidden ? "" : undefined}>
          <ChromeButton
            icon={listHidden ? "list" : "expand"}
            label={listHidden ? "Show message list" : "Read full width"}
            hint="]"
            start
            pressed={listHidden}
            onClick={onToggleList}
          />
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
            {detail.subject || "(no subject)"}
          </p>
          <div className="flex shrink-0 items-center">
            <ChromeButton icon="reply" label="Reply" hint="R" onClick={() => onReply("reply")} />
            <ChromeButton icon="replyAll" label="Reply all" hint="A" onClick={() => onReply("replyAll")} />
            <ChromeButton icon="forward" label="Forward" hint="F" onClick={() => onReply("forward")} />
            <ChromeButton
              icon="star"
              label={detail.flagged ? "Unstar" : "Star"}
              hint="S"
              pressed={detail.flagged}
              onClick={() => star([detail.id], !detail.flagged)}
            />
            <ChromeButton
              icon="trash"
              label={inTrash ? "Delete forever" : "Move to trash"}
              hint="#"
              danger
              end
              onClick={() => {
                if (inTrash) {
                  deleteForever([detail.id]);
                  toast("Deleted forever");
                } else {
                  trash([detail.id]);
                }
              }}
            />
          </div>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      {thread.length > 1 && (
        <div className={`flex flex-wrap items-center gap-1.5 border-b border-border py-2 ${chromePad}`}>
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
        <div className={`flex items-center justify-between gap-3 border-b border-border bg-secondary py-2 text-[13px] ${chromePad}`}>
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

      <article className="message-sheet">
        <header className="message-letterhead">
          <h1 className="page-title message-subject">
            {detail.subject || "(no subject)"}
          </h1>
          <div className="message-byline">
            <PersonAvatar
              name={displayName(detail.from)}
              src={addressAvatarSrc(detail.from.address)}
              className="message-avatar"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-4">
                <p className="truncate font-medium">{displayName(detail.from)}</p>
                <time
                  className="message-date"
                  dateTime={sentAt.toISOString()}
                >
                  {formatFullDate(detail.sentAt)}
                </time>
              </div>
              <p className="truncate text-muted-foreground">&lt;{detail.from.address}&gt;</p>
              <p className="truncate text-muted-foreground">
                To {formatAddressList(detail.to) || "undisclosed recipients"}
              </p>
              {detail.cc.length > 0 && (
                <p className="truncate text-muted-foreground">
                  Cc {formatAddressList(detail.cc)}
                </p>
              )}
            </div>
          </div>
        </header>

        {body ? (
          <div
            className="message-body"
            data-kind={body.kind ?? "html"}
            dangerouslySetInnerHTML={{ __html: body.html }}
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">Loading message</p>
        )}

        {files.length > 0 && (
          <footer className="message-files">
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
          </footer>
        )}
      </article>
      </div>
    </section>
  );
}
