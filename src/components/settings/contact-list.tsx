"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatRelative } from "@/lib/format";

type Contact = {
  id: string;
  email: string;
  name: string | null;
  notes: string | null;
  lastSeenAt: number | null;
};

export function ContactList({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(
      (contact) =>
        contact.email.toLowerCase().includes(needle) ||
        (contact.name ?? "").toLowerCase().includes(needle),
    );
  }, [contacts, query]);

  return (
    <div className="mt-6">
      <input
        type="search"
        className="field"
        placeholder="Filter by name or address"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {filtered.length === 0 ? (
        <p className="list-frame mt-4 p-6 text-center text-[13px] text-muted-foreground">
          {contacts.length === 0 ? "No contacts collected yet." : "Nothing matched that filter."}
        </p>
      ) : (
        <ul className="list-frame mt-4">
          {filtered.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{contact.name ?? contact.email}</p>
                <p className="truncate text-xs text-[var(--ink-muted)]">
                  {contact.email} · seen {formatRelative(contact.lastSeenAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger shrink-0 !py-1.5 text-xs"
                onClick={async () => {
                  await fetch(`/api/contacts?id=${contact.id}`, { method: "DELETE" });
                  router.refresh();
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
