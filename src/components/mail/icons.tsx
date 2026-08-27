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
  | "tag"
  | "flag"
  | "bookmark"
  | "bell"
  | "briefcase"
  | "receipt"
  | "card"
  | "cart"
  | "plane"
  | "home"
  | "heart"
  | "code"
  | "calendar"
  | "users"
  | "lock"
  | "bulb"
  | "chart"
  | "pin"
  | "gift"
  | "coffee"
  | "reply"
  | "replyAll"
  | "forward"
  | "plus";

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
  tag: (
    <>
      <path d="M3 12.4V4.6a1 1 0 0 1 1-1h7.8a1 1 0 0 1 .7.3l7.5 7.5a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 13.1a1 1 0 0 1-.3-.7Z" />
      <circle cx="7.8" cy="7.8" r="1.3" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5h11.5l-2 3.6 2 3.6H5" />
    </>
  ),
  bookmark: <path d="M7 3.8h10a1 1 0 0 1 1 1v15.4l-6-4.2-6 4.2V4.8a1 1 0 0 1 1-1Z" />,
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 1 1 11 0c0 4 1.5 5.4 1.5 5.4H5S6.5 14 6.5 10Z" />
      <path d="M10.2 19a2 2 0 0 0 3.6 0" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="1.6" />
      <path d="M9 7.5V5.6a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 5.6v1.9" />
      <path d="M3 12.5h18" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4L9.8 20.5l-2.1-1.4-2.2 1.4Z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.8" />
      <path d="M2.5 10h19" />
      <path d="M6.5 14.5h3" />
    </>
  ),
  cart: (
    <>
      <path d="M2.5 4h2l2.2 10.4a1.4 1.4 0 0 0 1.4 1.1h8.6a1.4 1.4 0 0 0 1.4-1.1L20 7.5H5.4" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  plane: <path d="M10.5 13.5 3 11V9l7.5 1.4V5.2a1.7 1.7 0 0 1 3.4 0v5.2L21.4 9v2l-7.5 2.5v4.2l2.4 1.4v1.4l-4.1-1-4.1 1v-1.4l2.4-1.4Z" />,
  home: (
    <>
      <path d="M3.5 10.6 12 4l8.5 6.6V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
      <path d="M9.5 21v-6.5h5V21" />
    </>
  ),
  heart: <path d="M12 20.2 4.6 13a4.4 4.4 0 1 1 6.2-6.2l1.2 1.2 1.2-1.2A4.4 4.4 0 1 1 19.4 13Z" />,
  code: <path d="m8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5M13.5 5l-3 14" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.6" />
      <path d="M3.5 10h17M8.5 3.5v3M15.5 3.5v3" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.7a3.2 3.2 0 0 1 0 5.6M17.5 14.4a6 6 0 0 1 3 5.1" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="1.8" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 16.5a6 6 0 1 1 6 0v1.8H9Z" />
      <path d="M10 21h4" />
    </>
  ),
  chart: <path d="M4 20V4M4 20h16M8 16.5v-5M12.5 16.5v-9M17 16.5v-3" />,
  pin: (
    <>
      <path d="M12 21v-6.5" />
      <path d="M8 3.5h8l-1 5 2.5 2.4v1.1H6.5v-1.1L9 8.5Z" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="9" width="17" height="11.5" rx="1.4" />
      <path d="M3.5 13.5h17M12 9v11.5" />
      <path d="M12 9S10.6 4 8.2 4a2.1 2.1 0 0 0 0 5M12 9s1.4-5 3.8-5a2.1 2.1 0 0 1 0 5" />
    </>
  ),
  coffee: (
    <>
      <path d="M4.5 8.5h12v6a5 5 0 0 1-10 0Z" />
      <path d="M16.5 10h1.8a2.4 2.4 0 0 1 0 4.8h-1.8" />
      <path d="M4.5 21h12" />
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
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
};

export function MailIcon({
  name,
  size = 16,
  filled = false,
  style,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
  style?: React.CSSProperties;
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
      style={style}
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
  if (folder.role === "junk" || /spam|junk/i.test(folder.name)) return "spam";
  return "folder";
}
