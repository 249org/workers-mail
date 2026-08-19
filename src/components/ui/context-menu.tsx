"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ReactNode } from "react";

// ── types ──────────────────────────────────────────────────────────────────

export type ContextMenuItem =
  | { type: "item"; label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: "separator" }
  | { type: "label"; label: string };

type MenuPosition = { x: number; y: number };

// ── provider ───────────────────────────────────────────────────────────────

type ContextMenuState = {
  items: ContextMenuItem[];
  position: MenuPosition;
  id: string;
} | null;

const CtxContext = createContext<{
  open: (items: ContextMenuItem[], position: MenuPosition, id: string) => void;
  close: () => void;
} | null>(null);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = useCallback((items: ContextMenuItem[], position: MenuPosition, id: string) => {
    setMenu({ items, position, id });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keydown);
    };
  }, [menu, close]);

  // Keep menu inside viewport
  const [adjusted, setAdjusted] = useState<MenuPosition | null>(null);
  useEffect(() => {
    if (!menu || !menuRef.current) { setAdjusted(null); return; }
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = menu.position;
    if (x + rect.width > vw - 8) x = Math.max(8, vw - rect.width - 8);
    if (y + rect.height > vh - 8) y = Math.max(8, vh - rect.height - 8);
    if (x !== menu.position.x || y !== menu.position.y) setAdjusted({ x, y });
    else setAdjusted(null);
  }, [menu]);

  const pos = adjusted ?? menu?.position;

  return (
    <CtxContext.Provider value={{ open, close }}>
      {children}
      {menu && pos && typeof document !== "undefined"
        ? createPortal(
            <MenuPanel
              ref={menuRef}
              items={menu.items}
              position={pos}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </CtxContext.Provider>
  );
}

// ── panel ──────────────────────────────────────────────────────────────────

import { forwardRef } from "react";

const MenuPanel = forwardRef<
  HTMLDivElement,
  { items: ContextMenuItem[]; position: MenuPosition; onClose: () => void }
>(({ items, position, onClose }, ref) => {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const actionItems = items.filter((item): item is Extract<ContextMenuItem, { type: "item" }> & { _idx: number } => false);
  // flat ordered list of non-disabled action items
  const actionIndexes: number[] = [];
  items.forEach((item, i) => {
    if (item.type === "item" && !item.disabled) actionIndexes.push(i);
  });

  useEffect(() => {
    itemRefs.current[actionIndexes[0] ?? 0]?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    const pos = actionIndexes.indexOf(activeIndex);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = actionIndexes[(pos + 1) % actionIndexes.length];
      if (next !== undefined) { setActiveIndex(next); itemRefs.current[next]?.focus(); }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = actionIndexes[(pos - 1 + actionIndexes.length) % actionIndexes.length];
      if (prev !== undefined) { setActiveIndex(prev); itemRefs.current[prev]?.focus(); }
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      tabIndex={-1}
      style={{ top: position.y, left: position.x }}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return <div key={i} className="ctx-sep" role="separator" />;
        }
        if (item.type === "label") {
          return <p key={i} className="ctx-label">{item.label}</p>;
        }
        return (
          <button
            key={i}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            role="menuitem"
            className="ctx-item"
            data-active={i === activeIndex ? "true" : undefined}
            data-danger={item.danger ? "true" : undefined}
            disabled={item.disabled}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            onFocus={() => setActiveIndex(i)}
          >
            {item.icon ? <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center text-[15px] opacity-70">{item.icon}</span> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
});

MenuPanel.displayName = "MenuPanel";

// ── trigger hook ───────────────────────────────────────────────────────────

export function useContextMenu() {
  const ctx = useContext(CtxContext);
  if (!ctx) throw new Error("useContextMenu must be used inside ContextMenuProvider");
  const id = useId();

  const trigger = useCallback(
    (items: ContextMenuItem[]) =>
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.open(items, { x: event.clientX, y: event.clientY }, id);
      },
    [ctx, id],
  );

  return { trigger, close: ctx.close };
}
