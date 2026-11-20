import type { ReactNode } from "react";

export type EditorIconName =
  | "undo"
  | "redo"
  | "code"
  | "link"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "codeBlock"
  | "rule"
  | "image"
  | "table"
  | "highlight"
  | "clear"
  | "expand"
  | "collapse";

const PATHS: Record<EditorIconName, ReactNode> = {
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  code: <path d="m8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  alignLeft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignCenter: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignRight: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  alignJustify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  bulletList: (
    <>
      <path d="M9.5 6.5h10.5M9.5 12h10.5M9.5 17.5h10.5" />
      <circle cx="5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="17.5" r="1" fill="currentColor" />
    </>
  ),
  orderedList: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="M4.5 4.5h1v4M4.2 8.5h2.2M4.2 14.2c.2-.6.7-1 1.3-1 .7 0 1.2.5 1.2 1.1 0 1-2.5 1.6-2.5 3.2h2.6" />
    </>
  ),
  quote: <path d="M6.5 7.5H10v4c0 2.8-1.3 4.6-3.5 5.5M14 7.5h3.5v4c0 2.8-1.3 4.6-3.5 5.5" />,
  codeBlock: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" />
    </>
  ),
  rule: <path d="M4 12h16M7 7.5h10M7 16.5h10" opacity="0.9" />,
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 10h17M3.5 14.5h17M9.5 5v14M15 5v14" />
    </>
  ),
  highlight: (
    <>
      <path d="m9 14.5 7.5-7.5 2.5 2.5-7.5 7.5H9z" />
      <path d="M13.5 10 16 12.5" />
    </>
  ),
  clear: (
    <>
      <path d="M5.5 5.5h11M11 5.5 8.5 18.5" />
      <path d="m15 14 5 5M20 14l-5 5" />
    </>
  ),
  expand: (
    <>
      <path d="M14 4h6v6M10 20H4v-6" />
      <path d="M20 4l-7 7M4 20l7-7" />
    </>
  ),
  collapse: (
    <>
      <path d="M20 10h-6V4M4 14h6v6" />
      <path d="m14 10 7-7M10 14l-7 7" />
    </>
  ),
};

export function EditorIcon({ name, size = 16 }: { name: EditorIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
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
