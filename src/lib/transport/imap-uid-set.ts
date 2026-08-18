/**
 * Turns an IMAP sequence set (`*`, `9167:*`) into the array edgeport joins into `UID FETCH`.
 * Edgeport has no UID-range API, so the instance `join` override is the supported escape hatch.
 */
export function imapUidSet(spec: string): number[] {
  const uids = [1];
  uids.join = () => spec;
  return uids;
}
