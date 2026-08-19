"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      type: "item";
      label: string;
      icon?: ReactNode;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      /** Keep the menu open, for items that toggle something. */
      keepOpen?: boolean;
      onSelect: () => void;
    }
  | { type: "custom"; id: string; render: (close: () => void) => ReactNode }
  | { type: "separator" }
  | { type: "label"; label: string };

/** Kept as the old name so existing call sites do not have to change. */
export type ContextMenuItem = MenuItem;

type Anchor = { x: number; y: number };

type MenuRequest = {
  items: MenuItem[];
  anchor: Anchor;
  /** Element focus returns to when the menu closes. */
  origin: HTMLElement | null;
};

const MenuContext = createContext<{
  open: (request: MenuRequest) => void;
  close: () => void;
} | null>(null);

const EDGE_GAP = 8;
const TYPEAHEAD_RESET_MS = 700;

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<MenuRequest | null>(null);

  const close = useCallback(() => {
    setRequest((current) => {
      current?.origin?.focus?.();
      return null;
    });
  }, []);

  const open = useCallback((next: MenuRequest) => setRequest(next), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <MenuContext.Provider value={value}>
      {children}
      {request && typeof document !== "undefined"
        ? createPortal(
            <MenuSurface key={`${request.anchor.x}:${request.anchor.y}`} request={request} onClose={close} />,
            document.body,
          )
        : null}
    </MenuContext.Provider>
  );
}

function MenuSurface({ request, onClose }: { request: MenuRequest; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  const typeahead = useRef({ buffer: "", at: 0 });
  const [position, setPosition] = useState<Anchor | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const selectable = useMemo(
    () =>
      request.items
        .map((item, index) => ({ item, index }))
        .filter((entry) => entry.item.type === "item" && !entry.item.disabled)
        .map((entry) => entry.index),
    [request.items],
  );

  /*
   * Position before the browser paints. The previous version measured in a passive
   * effect and then moved the menu, which showed as a visible jump near a viewport
   * edge; useLayoutEffect commits the corrected coordinates in the same frame.
   */
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - EDGE_GAP;
    const maxY = window.innerHeight - rect.height - EDGE_GAP;

    setPosition({
      x: Math.max(EDGE_GAP, Math.min(request.anchor.x, maxX)),
      y: Math.max(EDGE_GAP, Math.min(request.anchor.y, maxY)),
    });
  }, [request.anchor.x, request.anchor.y]);

  useEffect(() => {
    const first = selectable[0];
    if (first === undefined) {
      panelRef.current?.focus();
      return;
    }
    setActive(first);
    itemRefs.current.get(first)?.focus();
  }, [selectable]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    // Any scroll or resize invalidates the anchor, so close rather than drift.
    const onDismiss = () => onClose();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [onClose]);

  function move(delta: 1 | -1) {
    if (selectable.length === 0) return;
    const current = active === null ? -1 : selectable.indexOf(active);
    const next =
      selectable[(current + delta + selectable.length) % selectable.length] ?? selectable[0];
    if (next === undefined) return;
    setActive(next);
    itemRefs.current.get(next)?.focus();
  }

  function jump(edge: "first" | "last") {
    const target = edge === "first" ? selectable[0] : selectable[selectable.length - 1];
    if (target === undefined) return;
    setActive(target);
    itemRefs.current.get(target)?.focus();
  }

  function run(index: number) {
    const item = request.items[index];
    if (!item || item.type !== "item" || item.disabled) return;
    if (!item.keepOpen) onClose();
    item.onSelect();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        return move(1);
      case "ArrowUp":
        event.preventDefault();
        return move(-1);
      case "Home":
        event.preventDefault();
        return jump("first");
      case "End":
        event.preventDefault();
        return jump("last");
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        return onClose();
      case "Tab":
        event.preventDefault();
        return onClose();
      default:
        break;
    }

    // Typeahead: letters jump to the next item starting with what was typed.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const buffer =
        now - typeahead.current.at > TYPEAHEAD_RESET_MS
          ? event.key.toLowerCase()
          : typeahead.current.buffer + event.key.toLowerCase();
      typeahead.current = { buffer, at: now };

      const match = selectable.find((index) => {
        const item = request.items[index];
        return item?.type === "item" && item.label.toLowerCase().startsWith(buffer);
      });
      if (match !== undefined) {
        event.preventDefault();
        setActive(match);
        itemRefs.current.get(match)?.focus();
      }
    }
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      tabIndex={-1}
      aria-orientation="vertical"
      className="ctx-menu"
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        top: position?.y ?? request.anchor.y,
        left: position?.x ?? request.anchor.x,
        // Measure off-screen on the first pass so the unpositioned menu never flashes.
        visibility: position ? "visible" : "hidden",
      }}
    >
      {request.items.map((item, index) => {
        if (item.type === "separator") {
          return <div key={`sep-${index}`} className="ctx-sep" role="separator" />;
        }
        if (item.type === "label") {
          return (
            <p key={`label-${index}`} className="ctx-label">
              {item.label}
            </p>
          );
        }
        if (item.type === "custom") {
          return <div key={item.id}>{item.render(onClose)}</div>;
        }

        return (
          <button
            key={`${item.label}-${index}`}
            ref={(element) => {
              if (element) itemRefs.current.set(index, element);
              else itemRefs.current.delete(index);
            }}
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            tabIndex={-1}
            className="ctx-item"
            data-active={index === active ? "true" : undefined}
            data-danger={item.danger ? "true" : undefined}
            data-checked={item.checked ? "true" : undefined}
            disabled={item.disabled}
            onMouseEnter={() => {
              setActive(index);
              itemRefs.current.get(index)?.focus();
            }}
            onClick={() => run(index)}
          >
            {item.icon && (
              <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center opacity-70">
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint && <span className="kbd">{item.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;

/**
 * Returns handlers for a right-click target. Spread `bind(items)` onto the element;
 * it covers both the desktop context menu and a touch long-press.
 */
export function useContextMenu() {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useContextMenu must be used inside ContextMenuProvider");
  const { open, close } = context;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const cancelPress = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  useEffect(() => cancelPress, [cancelPress]);

  const bind = useCallback(
    (items: MenuItem[] | (() => MenuItem[])) => {
      const resolve = () => (typeof items === "function" ? items() : items);

      return {
        onContextMenu: (event: React.MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          open({
            items: resolve(),
            anchor: { x: event.clientX, y: event.clientY },
            origin: event.currentTarget as HTMLElement,
          });
        },
        onPointerDown: (event: React.PointerEvent) => {
          if (event.pointerType !== "touch") return;
          const target = event.currentTarget as HTMLElement;
          start.current = { x: event.clientX, y: event.clientY };
          timer.current = setTimeout(() => {
            open({
              items: resolve(),
              anchor: { x: start.current?.x ?? 0, y: start.current?.y ?? 0 },
              origin: target,
            });
            cancelPress();
          }, LONG_PRESS_MS);
        },
        onPointerMove: (event: React.PointerEvent) => {
          if (!start.current) return;
          const moved =
            Math.abs(event.clientX - start.current.x) > LONG_PRESS_SLOP_PX ||
            Math.abs(event.clientY - start.current.y) > LONG_PRESS_SLOP_PX;
          if (moved) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
      };
    },
    [open, cancelPress],
  );

  /** Opens the same menu from a button, anchored under it. */
  const openAt = useCallback(
    (element: HTMLElement, items: MenuItem[]) => {
      const rect = element.getBoundingClientRect();
      open({ items, anchor: { x: rect.left, y: rect.bottom + 4 }, origin: element });
    },
    [open],
  );

  return { bind, openAt, close };
}
