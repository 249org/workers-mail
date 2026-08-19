"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PersonAvatar } from "../person-avatar";
import { commitRecipient, lastRecipientQuery } from "@/lib/mail/address";
import { matchContacts, type SuggestContact } from "@/lib/mail/contact-match";
import { setKeyCapture } from "@/lib/keyboard/use-hotkeys";

type Props = {
  value: string;
  onChange: (value: string) => void;
  contacts: SuggestContact[];
  taken: string[];
  autoFocus?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

export function AddressField({
  value,
  onChange,
  contacts,
  taken,
  autoFocus,
  placeholder,
  "aria-label": ariaLabel,
}: Props) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-${index}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const query = lastRecipientQuery(value);
  const matches = useMemo(
    () => matchContacts(contacts, query, taken),
    [contacts, query, taken],
  );
  const show = open && matches.length > 0;
  const current = matches[active] ?? matches[0];

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!show) return;
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    update();
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [show, value]);

  useEffect(() => {
    if (!show) return;
    setKeyCapture((event) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      setOpen(false);
      return true;
    });
    return () => setKeyCapture(null);
  }, [show]);

  function pick(contact: SuggestContact) {
    onChange(commitRecipient(value, { address: contact.email, name: contact.name || undefined }));
    setOpen(false);
    inputRef.current?.focus();
  }

  function move(delta: number) {
    if (matches.length === 0) return;
    setActive((index) => (index + delta + matches.length) % matches.length);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        className="field !py-1.5"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && current ? optionId(active) : undefined}
        data-1p-ignore
        data-lpignore="true"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!show || !current) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
            return;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            pick(current);
          }
        }}
      />
      {show && rect && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              className="contact-suggest"
              style={{
                top: rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 220),
              }}
            >
              {matches.map((contact, index) => {
                const label = contact.name?.trim() || contact.email;
                return (
                  <li key={contact.id} role="presentation">
                    <button
                      type="button"
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      className="contact-suggest-item"
                      data-on={index === active ? "true" : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(contact)}
                    >
                      <PersonAvatar name={label} className="person-avatar person-avatar-sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{label}</span>
                        {contact.name?.trim() ? (
                          <span className="block truncate text-[var(--ink-muted)]">{contact.email}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
