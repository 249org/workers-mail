"use client";

import { useEffect, useRef, useState } from "react";
import { isFullDocument, previewDocument, readPreviewDocument } from "@/lib/mail/compose-html";

type Props = {
  html: string;
  /** Lets the text be changed in place, layout and all left as written. */
  editable: boolean;
  width: number | "100%";
  onEdit?: (html: string) => void;
  onSend?: () => void;
};

/*
 * Scripts never run here: neither sandbox below allows them, so a <script> or an
 * onerror in the message is inert either way. A preview that is only looked at also has
 * no origin of its own, so the app cannot reach into it and it cannot reach the app.
 * An editable one has to share the app's origin — that is how the edits are read back —
 * which is safe precisely because nothing inside it can execute.
 */
const SANDBOX_VIEW = "allow-popups allow-popups-to-escape-sandbox";
const SANDBOX_EDIT = "allow-same-origin allow-popups allow-popups-to-escape-sandbox";

export function PreviewFrame({ html, editable, width, onEdit, onSend }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const emitted = useRef<string | null>(null);
  const [page, setPage] = useState(() => ({ source: previewDocument(html), full: isFullDocument(html) }));
  const latest = useRef({ onEdit, onSend });
  latest.current = { onEdit, onSend };

  // Rebuilding the page puts the caret back at the top, so an edit made here must not
  // come back round as a new page. Only a change from elsewhere — the code — reloads.
  useEffect(() => {
    if (html === emitted.current) return;
    setPage({ source: previewDocument(html), full: isFullDocument(html) });
  }, [html]);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe || !editable) return;
    let attached: Document | null = null;

    const onInput = () => {
      if (!attached) return;
      const next = readPreviewDocument(attached, page.full);
      emitted.current = next;
      latest.current.onEdit?.(next);
    };
    // Keys pressed in the frame never reach the app's own listeners, so sending from it
    // is handled here.
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        latest.current.onSend?.();
      }
    };
    const attach = () => {
      const doc = iframe.contentDocument;
      if (!doc || doc === attached) return;
      attached = doc;
      doc.designMode = "on";
      doc.addEventListener("input", onInput);
      doc.addEventListener("keydown", onKey);
    };

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();
    return () => {
      iframe.removeEventListener("load", attach);
      attached?.removeEventListener("input", onInput);
      attached?.removeEventListener("keydown", onKey);
    };
  }, [editable, page]);

  return (
    <div className="compose-preview">
      <iframe
        // The sandbox is fixed once a frame loads, so a change of mode is a new frame.
        key={editable ? "edit" : "view"}
        ref={frame}
        title={editable ? "Editable preview of the message" : "Preview of the message"}
        sandbox={editable ? SANDBOX_EDIT : SANDBOX_VIEW}
        srcDoc={page.source}
        style={{ width }}
      />
    </div>
  );
}
