export type SuggestContact = {
  id: string;
  email: string;
  name: string | null;
};

/** Contacts whose name or address contains the typed token, skipping people already in the field. */
export function matchContacts(
  contacts: SuggestContact[],
  query: string,
  taken: string[],
): SuggestContact[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const used = new Set(taken.map((email) => email.toLowerCase()));
  return contacts
    .filter((contact) => !used.has(contact.email.toLowerCase()))
    .filter(
      (contact) =>
        contact.email.toLowerCase().includes(needle) ||
        (contact.name ?? "").toLowerCase().includes(needle),
    )
    .slice(0, 8);
}
