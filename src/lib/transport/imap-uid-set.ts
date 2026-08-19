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
