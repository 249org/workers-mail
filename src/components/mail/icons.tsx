import type { ReactNode } from "react";

export type IconName =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "trash"
  | "spam"
  | "folder"
  | "compose"
  | "search"
  | "sidebar"
  | "expand"
  | "list"
  | "mailbox"
  | "sync"
  | "seen"
  | "unseen"
  | "star"
  | "reply"
  | "replyAll"
  | "forward";

const PATHS: Record<IconName, ReactNode> = {
  inbox: (
    <>
      <path d="M3 10h18v9H3z" />
      <path d="M3 10l2.8-5.2A1 1 0 0 1 6.7 4h10.6a1 1 0 0 1 .9.8L21 10" />
      <path d="M9.5 14h5" />
    </>
  ),
  sent: <path d="M4 11.5l16-7.5-7 16-2.2-6.8L4 11.5z" />,
  drafts: (
    <>
      <path d="M14 4H7v16h10V9z" />
      <path d="M14 4v5h5" />
      <path d="M9.5 13h5M9.5 16.5h3.5" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7h16v3H4z" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 14h4" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9.5 7V5h5v2" />
      <path d="M7 7l1 13h8l1-13" />
    </>
  ),
  spam: (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4.2M12 16.8v.4" />
    </>
  ),
  folder: (
    <>
      <path d="M4 8h6l2 2h8v9H4z" />
      <path d="M4 8V6h5l1.5 2" />
    </>
  ),
  compose: (
    <>
      <path d="M13 5.5l5.5 5.5" />
      <path d="M5 19l.7-4.8L14.2 5.7 18.3 9.8 9.6 18.5 4.8 19.2z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.8 14.8L20 20" />
    </>
  ),
  sidebar: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M10 5v14" />
    </>
  ),
  expand: (
    <>
      <path d="M9 5H5v4" />
      <path d="M15 5h4v4" />
      <path d="M5 15v4h4" />
      <path d="M19 15v4h-4" />
    </>
  ),
  list: (
    <>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="M5 7h.01M5 12h.01M5 17h.01" />
    </>
  ),
  mailbox: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="1" />
      <path d="M3 8l9 6 9-6" />
    </>
  ),
  sync: (
    <>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 5v5h-5" />
    </>
  ),
  seen: (
    <>
      <path d="M4 10l8-5 8 5v9H4z" />
      <path d="M4 10l8 6 8-6" />
    </>
  ),
  unseen: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="1" />
      <path d="M3 8l9 6 9-6" />
    </>
  ),
  star: (
    <path d="M12 4.2l2.2 5.1 5.5.5-4.2 3.7 1.2 5.4L12 16.3 7.3 18.9l1.2-5.4-4.2-3.7 5.5-.5z" />
  ),
  reply: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v1" />
    </>
  ),
  replyAll: (
    <>
      <path d="M11 14 6 9l5-5" />
      <path d="M7 14 2 9l5-5" />
      <path d="M6 9h8a6 6 0 0 1 6 6v1" />
    </>
  ),
  forward: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0-6 6v1" />
    </>
  ),
};

export function MailIcon({
  name,
  size = 16,
  filled = false,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  );
}

export function folderIconName(folder: { role: string; name: string }): IconName {
  if (folder.role === "inbox") return "inbox";
  if (folder.role === "sent") return "sent";
  if (folder.role === "drafts") return "drafts";
  if (folder.role === "archive") return "archive";
  if (folder.role === "trash") return "trash";
  if (/spam|junk/i.test(folder.name)) return "spam";
  return "folder";
}
