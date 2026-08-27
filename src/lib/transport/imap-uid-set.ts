/**
 * Turns an IMAP sequence set (`*`, `9167:*`) into the array edgeport joins into `UID FETCH`.
 * Edgeport has no UID-range API, so the instance `join` override is the supported escape hatch.
 */
export function imapUidSet(spec: string): number[] {
  const uids = [1];
  uids.join = () => spec;
  return uids;
}

/** Expands `1,4:6` into `[1, 4, 5, 6]`. Used to zip COPYUID source/dest sets. */
export function expandImapSet(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const token = part.trim();
    if (!token || token === "*") continue;
    const [startRaw, endRaw] = token.split(":");
    const start = Number(startRaw);
    if (!Number.isFinite(start) || start <= 0) continue;
    const end = endRaw && endRaw !== "*" ? Number(endRaw) : start;
    if (!Number.isFinite(end) || end <= 0) continue;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let uid = lo; uid <= hi; uid += 1) out.push(uid);
  }
  return out;
}

/** Quoted IMAP astring. Folder names from LIST already match what SELECT expects. */
export function imapQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Reads the mailbox name off an untagged LIST line. */
export function parseListMailbox(line: string): string | null {
  if (!/^\* LIST\b/i.test(line)) return null;
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
  if (quoted?.[1] != null) return quoted[1].replace(/\\(.)/g, "$1");
  const atom = /\s([^"\s]+)\s*$/.exec(line);
  return atom?.[1] ?? null;
}

/**
 * Attributes from `* LIST (\HasNoChildren \Trash) "/" "[Gmail]/Bin"`, lowercased and
 * stripped of their leading backslash. These carry SPECIAL-USE (RFC 6154), which is the
 * only locale-independent way to tell which mailbox is the trash: Gmail calls it Bin in
 * en-GB, Corbeille in French, and only the `\Trash` attribute says so in every locale.
 */
export function parseListAttributes(line: string): string[] {
  if (!/^\* LIST\b/i.test(line)) return [];
  const match = /^\* LIST \(([^)]*)\)/i.exec(line);
  if (!match?.[1]) return [];
  return match[1]
    .split(/\s+/)
    .filter(Boolean)
    .map((flag) => flag.replace(/^\\/, "").toLowerCase());
}

/** Hierarchy delimiter from `* LIST (flags) delim mailbox`. NIL means flat. */
export function parseListDelimiter(line: string): string | null {
  if (!/^\* LIST\b/i.test(line)) return null;
  const match = /^\* LIST \([^)]*\) (NIL|"((?:[^"\\]|\\.)*)")/i.exec(line);
  if (!match || match[1]?.toUpperCase() === "NIL") return null;
  return match[2] ?? null;
}

export type MailboxNamespace = {
  prefix: string;
  delimiter: string;
};

/**
 * Personal namespace from `* NAMESPACE (("INBOX." ".")) NIL NIL`.
 * Empty prefix + "/" is Gmail; "INBOX." + "." is Courier/one.com.
 */
export function parseNamespacePersonal(line: string): MailboxNamespace | null {
  if (!/^\* NAMESPACE\b/i.test(line)) return null;
  const rest = line.replace(/^\* NAMESPACE\s+/i, "");
  if (/^NIL\b/i.test(rest)) return null;
  const match = /^\(\("((?:[^"\\]|\\.)*)" (NIL|"((?:[^"\\]|\\.)*)")/i.exec(rest);
  if (!match) return null;
  const prefix = (match[1] ?? "").replace(/\\(.)/g, "$1");
  if (match[2]?.toUpperCase() === "NIL") return { prefix, delimiter: "" };
  return { prefix, delimiter: (match[3] ?? "").replace(/\\(.)/g, "$1") };
}

/** Infers `.` vs `/` from existing LIST paths when NAMESPACE is missing. */
export function inferHierarchyDelimiter(paths: string[]): string | null {
  if (paths.some((path) => /^inbox\./i.test(path))) return ".";
  if (paths.some((path) => path.includes("/"))) return "/";
  if (paths.some((path) => path.includes(".") && path.toUpperCase() !== "INBOX")) return ".";
  return null;
}

/**
 * CREATE targets: the leaf name first (Gmail), then the personal-namespace
 * child (Courier/one.com only allow INBOX.others, not a top-level others).
 */
export function createMailboxCandidates(
  name: string,
  namespace: MailboxNamespace | null,
  existingPaths: string[] = [],
): string[] {
  const out: string[] = [];
  const add = (path: string) => {
    if (path && !out.includes(path)) out.push(path);
  };

  add(name);
  if (namespace?.prefix) add(`${namespace.prefix}${name}`);

  const delimiter = namespace?.delimiter || inferHierarchyDelimiter(existingPaths);
  if (delimiter) {
    add(`INBOX${delimiter}${name}`);
  } else if (!namespace?.prefix) {
    add(`INBOX.${name}`);
    add(`INBOX/${name}`);
  }
  return out;
}

/** Picks the LIST path that matches a created folder name, including nested leaves. */
export function matchMailboxPath(paths: string[], name: string): string | null {
  const lower = name.toLowerCase();
  const exact = paths.find((path) => path.toLowerCase() === lower);
  if (exact) return exact;
  return (
    paths.find((path) => (path.split(/[/.]/).pop() ?? path).toLowerCase() === lower) ?? null
  );
}

/** Reads RFC 4315 COPYUID from a tagged or untagged OK. */
export function parseCopyUid(response: { text: string; untagged: string[] }): Map<number, number> {
  const blob = [response.text, ...response.untagged].join(" ");
  const match = /\[COPYUID \d+ (\S+) (\S+)\]/.exec(blob);
  const mapped = new Map<number, number>();
  if (!match?.[1] || !match[2]) return mapped;
  const from = expandImapSet(match[1]);
  const to = expandImapSet(match[2]);
  const n = Math.min(from.length, to.length);
  for (let i = 0; i < n; i += 1) {
    const src = from[i];
    const dest = to[i];
    if (src != null && dest != null) mapped.set(src, dest);
  }
  return mapped;
}
