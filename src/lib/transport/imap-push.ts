import type { Database } from "@/lib/db";
import type { Folder, Mailbox } from "@/lib/mail/mailboxes";
import { imapAuth } from "./credentials";
import { ImapMutator } from "./imap-commands";

export type ImapMessageRef = {
  id: string;
  folderId: string;
  remoteUid: number | null;
};

export type ImapPush =
  | { action: "flags"; seen?: boolean; flagged?: boolean }
  | { action: "move"; destination: Folder }
  | { action: "delete" };

function remoteMailbox(folder: Folder): string {
  return folder.remotePath ?? (folder.role === "inbox" ? "INBOX" : folder.name);
}

function groupedUids(refs: ImapMessageRef[]): Map<string, { ids: string[]; uids: number[] }> {
  const groups = new Map<string, { ids: string[]; uids: number[] }>();
  for (const ref of refs) {
    if (ref.remoteUid == null) continue;
    const group = groups.get(ref.folderId) ?? { ids: [], uids: [] };
    group.ids.push(ref.id);
    group.uids.push(ref.remoteUid);
    groups.set(ref.folderId, group);
  }
  return groups;
}

/**
 * Mirrors a local mutation onto the IMAP server so other clients see the same change.
 * Returns new destination UIDs keyed by message id after a move.
 */
export async function pushImapChanges(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  folders: Folder[],
  refs: ImapMessageRef[],
  change: ImapPush,
): Promise<Map<string, number | null>> {
  const nextUids = new Map<string, number | null>();
  if (mailbox.type !== "external_imap") return nextUids;

  const groups = groupedUids(refs);
  if (groups.size === 0) return nextUids;

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const credentials = await imapAuth(mailbox, env, db);
  const session = await ImapMutator.open(credentials);
  try {
    for (const [folderId, group] of groups) {
      const source = folderById.get(folderId);
      if (!source) continue;
      await session.select(remoteMailbox(source));

      if (change.action === "flags") {
        if (change.seen !== undefined) {
          await session.storeFlags(group.uids, ["\\Seen"], change.seen);
        }
        if (change.flagged !== undefined) {
          await session.storeFlags(group.uids, ["\\Flagged"], change.flagged);
        }
        continue;
      }

      if (change.action === "delete") {
        await session.expungeUids(group.uids);
        continue;
      }

      const mapped = await session.move(group.uids, remoteMailbox(change.destination));
      for (let i = 0; i < group.ids.length; i += 1) {
        const id = group.ids[i];
        const uid = group.uids[i];
        if (!id || uid == null) continue;
        nextUids.set(id, mapped.get(uid) ?? null);
      }
    }
    return nextUids;
  } finally {
    await session.close();
  }
}
