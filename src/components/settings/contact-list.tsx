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
    <div>
      <div className="border-b border-border px-8 py-4">
        <input
          type="search"
          className="field"
          placeholder="Filter by name or address"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-8 py-10 text-center text-[13px] text-muted-foreground">
          {contacts.length === 0 ? "No contacts collected yet." : "Nothing matched that filter."}
        </p>
      ) : (
        <div className="settings-ledger settings-ledger-contacts">
          <div className="settings-ledger-head" aria-hidden>
            <span>Person</span>
            <span className="max-md:hidden">Address</span>
            <span>Seen</span>
            <span />
          </div>
          {filtered.map((contact) => (
            <div key={contact.id} className="settings-ledger-row">
              <p className="truncate text-[13px] font-medium">{contact.name ?? contact.email}</p>
              <p className="truncate text-[13px] text-muted-foreground max-md:hidden">
                {contact.email}
              </p>
              <p className="text-[13px] text-muted-foreground">{formatRelative(contact.lastSeenAt)}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn btn-danger !h-8 !px-3"
                  onClick={async () => {
                    await fetch(`/api/contacts?id=${contact.id}`, { method: "DELETE" });
                    router.refresh();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
