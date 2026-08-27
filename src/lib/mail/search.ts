export type SearchQuery = {
  terms: string[];
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  seen?: boolean;
  flagged?: boolean;
  folder?: string;
  before?: number;
  after?: number;
};

export type ParsedSearch = SearchQuery & {
  /** True when the input carried nothing a query could filter on. */
  empty: boolean;
};

const OPERATOR = /^(from|to|subject|has|is|in|before|after|older|newer):(.*)$/i;

/**
 * Parses a Superhuman-style query into structured filters. Unknown operators fall
 * through to free text rather than erroring, so a half-typed query still searches.
 */
export function parseSearch(input: string): ParsedSearch {
  const query: SearchQuery = { terms: [] };

  for (const token of tokenize(input)) {
    const match = token.value.match(OPERATOR);
    // A token that opens with a quote is a literal phrase, so `"from:sam"` stays
    // free text while `subject:"launch plan"` is still read as an operator.
    if (!token.literal && match) {
      const key = (match[1] ?? "").toLowerCase();
      const value = unquote(match[2] ?? "").trim();
      if (value && applyOperator(query, key, value)) continue;
    }
    if (token.value.trim()) query.terms.push(token.value.trim());
  }

  return { ...query, empty: isEmpty(query) };
}

function applyOperator(query: SearchQuery, key: string, value: string): boolean {
  switch (key) {
    case "from":
      query.from = value.toLowerCase();
      return true;
    case "to":
      query.to = value.toLowerCase();
      return true;
    case "subject":
      query.subject = value.toLowerCase();
      return true;
    case "in":
      query.folder = value.toLowerCase();
      return true;
    case "has":
      if (/^(attachment|attachments|file|files)$/i.test(value)) {
        query.hasAttachment = true;
        return true;
      }
      return false;
    case "is":
      return applyIs(query, value.toLowerCase());
    case "before":
    case "older": {
      const date = parseDate(value);
      if (date === null) return false;
      query.before = date;
      return true;
    }
    case "after":
    case "newer": {
      const date = parseDate(value);
      if (date === null) return false;
      query.after = date;
      return true;
    }
    default:
      return false;
  }
}

function applyIs(query: SearchQuery, value: string): boolean {
  switch (value) {
    case "unread":
      query.seen = false;
      return true;
    case "read":
      query.seen = true;
      return true;
    case "starred":
    case "flagged":
      query.flagged = true;
      return true;
    case "unstarred":
      query.flagged = false;
      return true;
    default:
      return false;
  }
}

/**
 * Accepts absolute dates (2024-03-01, 2024/03/01) and relative spans (7d, 3w, 6m, 1y).
 * Returns seconds since the epoch, or null when the value is not a date.
 */
export function parseDate(value: string, now = Date.now()): number | null {
  const relative = value.match(/^(\d+)\s*(d|w|m|y)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = (relative[2] ?? "d").toLowerCase();
    const days = unit === "d" ? 1 : unit === "w" ? 7 : unit === "m" ? 30 : 365;
    return Math.floor((now - amount * days * 86_400_000) / 1000);
  }

  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(value)) {
    const parsed = Date.parse(value.replace(/\//g, "-"));
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }

  if (value.toLowerCase() === "today") {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return Math.floor(midnight.getTime() / 1000);
  }

  return null;
}

/**
 * Splits on whitespace while keeping quoted phrases intact. `literal` marks tokens
 * that opened with a quote, which are never reinterpreted as operators.
 */
function tokenize(input: string): Array<{ value: string; literal: boolean }> {
  const tokens: Array<{ value: string; literal: boolean }> = [];
  let current = "";
  let inQuotes = false;
  let literal = false;

  for (const char of input) {
    if (char === '"') {
      if (!inQuotes && current === "") literal = true;
      inQuotes = !inQuotes;
      continue;
    }
    if (/\s/.test(char) && !inQuotes) {
      if (current) tokens.push({ value: current, literal });
      current = "";
      literal = false;
      continue;
    }
    current += char;
  }

  if (current) tokens.push({ value: current, literal });
  return tokens;
}

function unquote(value: string): string {
  return value.replace(/^"(.*)"$/, "$1");
}

function isEmpty(query: SearchQuery): boolean {
  return (
    query.terms.length === 0 &&
    query.from === undefined &&
    query.to === undefined &&
    query.subject === undefined &&
    query.hasAttachment === undefined &&
    query.seen === undefined &&
    query.flagged === undefined &&
    query.folder === undefined &&
    query.before === undefined &&
    query.after === undefined
  );
}

/**
 * What the search bar offers when it opens. A `filter` is complete on its own and
 * narrows the list as soon as it is picked; a `prefix` only writes the operator and
 * leaves the caret after it, because the useful part is what gets typed next.
 */
export type SearchSuggestion = {
  id: string;
  label: string;
  token: string;
  hint?: string;
  kind: "filter" | "prefix";
  /** Tokens this one contradicts, dropped when it is applied. */
  replaces?: readonly string[];
};

export const SEARCH_FILTERS: readonly SearchSuggestion[] = [
  { id: "unread", kind: "filter", label: "Unread", token: "is:unread", replaces: ["is:read"] },
  {
    id: "starred",
    kind: "filter",
    label: "Starred",
    token: "is:starred",
    replaces: ["is:unstarred"],
  },
  { id: "attachments", kind: "filter", label: "Has attachment", token: "has:attachment" },
  { id: "recent", kind: "filter", label: "Past week", token: "after:7d" },
];

export const SEARCH_PREFIXES: readonly SearchSuggestion[] = [
  { id: "from", kind: "prefix", label: "From", token: "from:", hint: "sender" },
  { id: "to", kind: "prefix", label: "To", token: "to:", hint: "recipient" },
  { id: "subject", kind: "prefix", label: "Subject", token: "subject:", hint: "words in subject" },
  { id: "in", kind: "prefix", label: "In folder", token: "in:", hint: "folder name" },
  { id: "after", kind: "prefix", label: "After", token: "after:", hint: "7d, 2024-01-01" },
  { id: "before", kind: "prefix", label: "Before", token: "before:", hint: "30d, 2024-06-01" },
];

/**
 * Applies a suggestion to the query. A filter is added or taken back out; a prefix is
 * appended for typing, and picking a second one replaces the prefix left dangling by the
 * first rather than leaving `from: to:` behind.
 */
export function applySuggestion(query: string, suggestion: SearchSuggestion): string {
  if (suggestion.kind === "filter") {
    return toggleSearchToken(query, suggestion.token, suggestion.replaces ?? []);
  }
  const base = query.replace(/(^|\s)[a-z]+:\s*$/i, "$1").trimEnd();
  return base ? `${base} ${suggestion.token}` : suggestion.token;
}

/** True when the query already carries this filter's token. */
export function hasSearchToken(query: string, token: string): boolean {
  return tokenize(query).some(
    (entry) => !entry.literal && entry.value.toLowerCase() === token.toLowerCase(),
  );
}

/**
 * Adds the token, or takes it back out when it is already there. Tokens it contradicts
 * go with it — turning on Unread while `is:read` is typed would otherwise leave a query
 * that can never match anything.
 */
export function toggleSearchToken(
  query: string,
  token: string,
  replaces: readonly string[] = [],
): string {
  const drop = new Set([token.toLowerCase(), ...replaces.map((entry) => entry.toLowerCase())]);
  const kept = tokenize(query).filter(
    (entry) => entry.literal || !drop.has(entry.value.toLowerCase()),
  );
  const rendered = kept.map((entry) => (entry.literal ? `"${entry.value}"` : entry.value));

  if (hasSearchToken(query, token)) return rendered.join(" ");
  return [...rendered, token].join(" ").trim();
}

export const SEARCH_OPERATORS = [
  { token: "from:", hint: "sender name or address" },
  { token: "to:", hint: "recipient address" },
  { token: "subject:", hint: "words in the subject" },
  { token: "has:attachment", hint: "messages with files" },
  { token: "is:unread", hint: "unread only" },
  { token: "is:starred", hint: "starred only" },
  { token: "in:", hint: "a folder name" },
  { token: "after:", hint: "7d, 2024-01-01" },
  { token: "before:", hint: "30d, 2024-06-01" },
] as const;
