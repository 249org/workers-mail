"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { StarterKit } from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Image as ImageNode } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { setKeyCapture } from "@/lib/keyboard/use-hotkeys";
import { normalizeLink } from "@/lib/mail/compose-html";
import { useDismiss } from "@/components/ui/use-dismiss";
import { EditorIcon, type EditorIconName } from "./editor-icons";

/*
 * Pictures travel inside the message, so one the size of a phone photo would take most
 * of a send on its own. Past this, the editor says so rather than quietly carrying it.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const FONTS = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet", value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
];

const SIZES = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "" },
  { label: "Medium", value: "16px" },
  { label: "Large", value: "20px" },
  { label: "Larger", value: "24px" },
  { label: "Huge", value: "32px" },
];

/* Colours every client draws the same: plain hex, no names, no transparency. */
const SWATCHES = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#ffffff",
  "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085", "#2980b9", "#8e44ad",
  "#f5b7b1", "#fad7a0", "#f9e79f", "#abebc6", "#a3e4d7", "#aed6f1", "#d7bde2",
];

type Props = {
  html: string;
  onChange: (html: string) => void;
  /** Whether the composer is full page, so the writing area grows to fill it. */
  expanded: boolean;
  onError: (message: string) => void;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the picture."));
    reader.readAsDataURL(file);
  });
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

export function RichEditor({ html, onChange, expanded, onError }: Props) {
  const emitted = useRef(html);
  const reportError = useRef(onError);
  reportError.current = onError;

  const insertImages = useCallback(async (view: EditorView, files: File[], at?: number) => {
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) {
        reportError.current(`${file.name || "That picture"} is over 5 MB. Resize it and try again.`);
        continue;
      }
      const src = await readAsDataUrl(file);
      const node = view.state.schema.nodes.image?.create({ src, alt: file.name.replace(/\.[^.]+$/, "") });
      if (!node) return;
      const tr =
        at == null ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(at, node);
      view.dispatch(tr);
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TableKit.configure({ table: { resizable: true } }),
      TextStyleKit.configure({ lineHeight: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ImageNode.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: "Write your message…" }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: "rich-content",
        "aria-label": "Message",
        "aria-multiline": "true",
        role: "textbox",
      },
      // Pasting or dropping a picture puts it where it was put, rather than nowhere.
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        void insertImages(view, files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(view, files, at);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = current.isEmpty ? "" : current.getHTML();
      emitted.current = next;
      onChange(next);
    },
  });

  // A change from outside — a format switch, the signature arriving — replaces the
  // document. One that came from typing here is already in it.
  useEffect(() => {
    if (!editor || html === emitted.current) return;
    emitted.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, html]);

  if (!editor) return <div className="rich-editor" data-expanded={expanded ? "" : undefined} />;

  return (
    <div className="rich-editor" data-expanded={expanded ? "" : undefined}>
      <Toolbar editor={editor} onPickImages={(files) => void insertImages(editor.view, files)} />
      <div className="rich-surface" onClick={() => !editor.isFocused && editor.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function blockOf(editor: Editor): string {
  for (const level of [1, 2, 3] as const) {
    if (editor.isActive("heading", { level })) return `h${level}`;
  }
  if (editor.isActive("codeBlock")) return "code";
  return "p";
}

function Toolbar({ editor, onPickImages }: { editor: Editor; onPickImages: (files: File[]) => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = e.getAttributes("textStyle") as Record<string, string | undefined>;
      return {
        block: blockOf(e),
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        link: e.isActive("link"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        quote: e.isActive("blockquote"),
        align: (["center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
        color: style.color ?? "",
        background: style.backgroundColor ?? "",
        fontFamily: style.fontFamily ?? "",
        fontSize: style.fontSize ?? "",
        inTable: e.isActive("table"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        canMerge: e.can().mergeCells(),
        canSplit: e.can().splitCell(),
      };
    },
  });

  const run = (command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) =>
    command(editor.chain().focus()).run();

  return (
    <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
      <div className="rich-toolbar-row">
        <Tool icon="undo" label="Undo" keys="⌘Z" disabled={!state.canUndo} onRun={() => run((c) => c.undo())} />
        <Tool icon="redo" label="Redo" keys="⌘⇧Z" disabled={!state.canRedo} onRun={() => run((c) => c.redo())} />
        <Divider />
        <select
          className="rich-select"
          aria-label="Text style"
          value={state.block}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "p") run((c) => c.setParagraph());
            else if (value === "code") run((c) => c.toggleCodeBlock());
            else run((c) => c.toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }));
          }}
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="code">Code block</option>
        </select>
        <select
          className="rich-select"
          aria-label="Font"
          value={FONTS.some((f) => f.value === state.fontFamily) ? state.fontFamily : ""}
          onChange={(event) => {
            const value = event.target.value;
            run((c) => (value ? c.setFontFamily(value) : c.unsetFontFamily()));
          }}
        >
          {FONTS.map((font) => (
            <option key={font.label} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          className="rich-select"
          aria-label="Size"
          value={SIZES.some((s) => s.value === state.fontSize) ? state.fontSize : ""}
          onChange={(event) => {
            const value = event.target.value;
            run((c) => (value ? c.setFontSize(value) : c.unsetFontSize()));
          }}
        >
          {SIZES.map((size) => (
            <option key={size.label} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
        <Divider />
        <Tool glyph="B" glyphClass="font-bold" label="Bold" keys="⌘B" active={state.bold} onRun={() => run((c) => c.toggleBold())} />
        <Tool glyph="I" glyphClass="italic font-serif" label="Italic" keys="⌘I" active={state.italic} onRun={() => run((c) => c.toggleItalic())} />
        <Tool glyph="U" glyphClass="underline" label="Underline" keys="⌘U" active={state.underline} onRun={() => run((c) => c.toggleUnderline())} />
        <Tool glyph="S" glyphClass="line-through" label="Strikethrough" keys="⌘⇧S" active={state.strike} onRun={() => run((c) => c.toggleStrike())} />
        <Tool icon="code" label="Inline code" keys="⌘E" active={state.code} onRun={() => run((c) => c.toggleCode())} />
        <ColorTool
          label="Text colour"
          current={state.color}
          trigger={
            <span className="rich-color-glyph" style={{ ["--swatch" as string]: state.color || "currentColor" }}>
              A
            </span>
          }
          onPick={(color) => run((c) => (color ? c.setColor(color) : c.unsetColor()))}
        />
        <ColorTool
          label="Highlight"
          current={state.background}
          trigger={
            <span className="rich-color-icon" style={{ ["--swatch" as string]: state.background || "transparent" }}>
              <EditorIcon name="highlight" />
            </span>
          }
          onPick={(color) => run((c) => (color ? c.setBackgroundColor(color) : c.unsetBackgroundColor()))}
        />
        <LinkTool editor={editor} active={state.link} />
        <Divider />
        {(
          [
            ["left", "alignLeft", "Align left"],
            ["center", "alignCenter", "Centre"],
            ["right", "alignRight", "Align right"],
            ["justify", "alignJustify", "Justify"],
          ] as const
        ).map(([align, icon, label]) => (
          <Tool
            key={align}
            icon={icon}
            label={label}
            active={state.align === align}
            onRun={() => run((c) => (align === "left" ? c.unsetTextAlign() : c.setTextAlign(align)))}
          />
        ))}
        <Divider />
        <Tool icon="bulletList" label="Bulleted list" keys="⌘⇧8" active={state.bullet} onRun={() => run((c) => c.toggleBulletList())} />
        <Tool icon="orderedList" label="Numbered list" keys="⌘⇧7" active={state.ordered} onRun={() => run((c) => c.toggleOrderedList())} />
        <Tool icon="quote" label="Quote" keys="⌘⇧B" active={state.quote} onRun={() => run((c) => c.toggleBlockquote())} />
        <Tool icon="codeBlock" label="Code block" active={state.block === "code"} onRun={() => run((c) => c.toggleCodeBlock())} />
        <Tool icon="rule" label="Divider line" onRun={() => run((c) => c.setHorizontalRule())} />
        <Divider />
        <ImageTool editor={editor} onPickFiles={onPickImages} />
        <TableTool onInsert={(rows, cols) => run((c) => c.insertTable({ rows, cols, withHeaderRow: true }))} />
        <Tool icon="clear" label="Clear formatting" onRun={() => run((c) => c.unsetAllMarks().clearNodes())} />
      </div>

      {state.inTable ? (
        <div className="rich-toolbar-row rich-table-row" aria-label="Table">
          <span className="eyebrow text-muted-foreground">Table</span>
          <TextTool label="Row above" onRun={() => run((c) => c.addRowBefore())} />
          <TextTool label="Row below" onRun={() => run((c) => c.addRowAfter())} />
          <TextTool label="Delete row" onRun={() => run((c) => c.deleteRow())} />
          <Divider />
          <TextTool label="Column left" onRun={() => run((c) => c.addColumnBefore())} />
          <TextTool label="Column right" onRun={() => run((c) => c.addColumnAfter())} />
          <TextTool label="Delete column" onRun={() => run((c) => c.deleteColumn())} />
          <Divider />
          <TextTool label="Merge cells" disabled={!state.canMerge} onRun={() => run((c) => c.mergeCells())} />
          <TextTool label="Split cell" disabled={!state.canSplit} onRun={() => run((c) => c.splitCell())} />
          <TextTool label="Header row" onRun={() => run((c) => c.toggleHeaderRow())} />
          <Divider />
          <TextTool label="Delete table" danger onRun={() => run((c) => c.deleteTable())} />
        </div>
      ) : null}
    </div>
  );
}

function Divider() {
  return <span className="rich-divider" aria-hidden />;
}

/*
 * Pressing a tool must not take focus from the document, or the selection it is meant
 * to act on is gone by the time the click lands.
 */
function keepSelection(event: React.MouseEvent) {
  event.preventDefault();
}

function Tool({
  icon,
  glyph,
  glyphClass,
  label,
  keys,
  active = false,
  disabled = false,
  onRun,
}: {
  icon?: EditorIconName;
  glyph?: string;
  glyphClass?: string;
  label: string;
  keys?: string;
  active?: boolean;
  disabled?: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      className="rich-tool tip"
      data-tip={keys ? `${label}  ${keys}` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onRun}
    >
      {icon ? <EditorIcon name={icon} /> : <span className={`rich-glyph ${glyphClass ?? ""}`}>{glyph}</span>}
    </button>
  );
}

function TextTool({
  label,
  danger = false,
  disabled = false,
  onRun,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      className="rich-text-tool"
      data-danger={danger ? "" : undefined}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onRun}
    >
      {label}
    </button>
  );
}

/**
 * A small panel under a toolbar button. Escape closes the panel and nothing else: the
 * composer's own Escape would otherwise take the whole message down with it.
 */
function Popover({
  label,
  trigger,
  active = false,
  children,
  wide = false,
}: {
  label: string;
  trigger: ReactNode;
  active?: boolean;
  children: (close: () => void) => ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, root, close);

  useEffect(() => {
    if (!open) return;
    const capture = (event: KeyboardEvent) => event.key === "Escape";
    setKeyCapture(capture);
    return () => setKeyCapture(null);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="rich-tool tip"
        data-tip={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={active}
        onMouseDown={keepSelection}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open ? (
        <div className="menu rich-popover" data-wide={wide ? "" : undefined} role="dialog" aria-label={label}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

function ColorTool({
  label,
  current,
  trigger,
  onPick,
}: {
  label: string;
  current: string;
  trigger: ReactNode;
  onPick: (color: string | null) => void;
}) {
  return (
    <Popover label={label} trigger={trigger}>
      {(close) => (
        <div className="grid gap-2">
          <div className="rich-swatches">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="rich-swatch"
                style={{ background: swatch }}
                aria-label={swatch}
                aria-pressed={current.toLowerCase() === swatch}
                onMouseDown={keepSelection}
                onClick={() => {
                  onPick(swatch);
                  close();
                }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-quiet !h-7 !px-2 text-[12.5px]"
              onMouseDown={keepSelection}
              onClick={() => {
                onPick(null);
                close();
              }}
            >
              Default
            </button>
            <label className="btn btn-ghost !h-7 !px-2 text-[12.5px]">
              Custom…
              <input
                type="color"
                className="sr-only"
                value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#000000"}
                onChange={(event) => onPick(event.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </Popover>
  );
}

function LinkTool({ editor, active }: { editor: Editor; active: boolean }) {
  return (
    <Popover label="Link" active={active} trigger={<EditorIcon name="link" />} wide>
      {(close) => <LinkForm editor={editor} active={active} close={close} />}
    </Popover>
  );
}

function LinkForm({ editor, active, close }: { editor: Editor; active: boolean; close: () => void }) {
  const [value, setValue] = useState(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const [invalid, setInvalid] = useState(false);

  function apply() {
    const href = normalizeLink(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    // With nothing selected the address itself becomes the linked words.
    if (editor.state.selection.empty && !active) {
      chain.insertContent({ type: "text", text: value.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    close();
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <input
        autoFocus
        className="field !h-8"
        placeholder="https://example.com or name@example.com"
        value={value}
        aria-label="Link address"
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
      />
      {invalid ? <p className="text-[12px] text-[var(--danger)]">Enter a web or email address.</p> : null}
      <div className="flex justify-end gap-2">
        {active ? (
          <button
            type="button"
            className="btn btn-quiet !h-7 !px-2 text-[12.5px]"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              close();
            }}
          >
            Remove link
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary !h-7 !px-3 text-[12.5px]">
          {active ? "Update" : "Add link"}
        </button>
      </div>
    </form>
  );
}

function ImageTool({ editor, onPickFiles }: { editor: Editor; onPickFiles: (files: File[]) => void }) {
  return (
    <Popover label="Picture" trigger={<EditorIcon name="image" />} wide>
      {(close) => <ImageForm editor={editor} onPickFiles={onPickFiles} close={close} />}
    </Popover>
  );
}

function ImageForm({
  editor,
  onPickFiles,
  close,
}: {
  editor: Editor;
  onPickFiles: (files: File[]) => void;
  close: () => void;
}) {
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-2">
      <button type="button" className="btn btn-ghost !h-8 w-full" onClick={() => file.current?.click()}>
        Upload from this computer
      </button>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          onPickFiles(imageFiles(event.target.files));
          event.target.value = "";
          close();
        }}
      />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^https:\/\/\S+$/i.test(url.trim())) {
            setInvalid(true);
            return;
          }
          editor.chain().focus().setImage({ src: url.trim() }).run();
          close();
        }}
      >
        <input
          className="field !h-8"
          placeholder="Or paste an https:// address"
          value={url}
          aria-label="Picture address"
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
        <button type="submit" className="btn btn-primary !h-8 shrink-0 !px-3 text-[12.5px]">
          Insert
        </button>
      </form>
      {invalid ? <p className="text-[12px] text-[var(--danger)]">Use an address starting with https://</p> : null}
    </div>
  );
}

const GRID_COLS = 8;
const GRID_ROWS = 6;

/** Pick a table's size by sweeping across a grid, as word processors do. */
function TableTool({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  return (
    <Popover label="Table" trigger={<EditorIcon name="table" />}>
      {(close) => (
        <div className="grid gap-2">
          <div
            className="rich-grid"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
            onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
              const row = Math.floor(index / GRID_COLS) + 1;
              const col = (index % GRID_COLS) + 1;
              const lit = row <= hover.rows && col <= hover.cols;
              return (
                <button
                  key={index}
                  type="button"
                  className="rich-grid-cell"
                  data-lit={lit ? "" : undefined}
                  aria-label={`${row} by ${col} table`}
                  onMouseDown={keepSelection}
                  onMouseEnter={() => setHover({ rows: row, cols: col })}
                  onFocus={() => setHover({ rows: row, cols: col })}
                  onClick={() => {
                    onInsert(row, col);
                    close();
                  }}
                />
              );
            })}
          </div>
          <p className="num text-center text-[12px] text-muted-foreground">
            {hover.rows ? `${hover.rows} × ${hover.cols}` : "Choose a size"}
          </p>
        </div>
      )}
    </Popover>
  );
}
