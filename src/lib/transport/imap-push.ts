import type { Database } from "@/lib/db";
import { upsertRemoteFolder, type Folder, type Mailbox } from "@/lib/mail/mailboxes";
import { imapAuth } from "./credentials";
import { folderCreateRejected } from "./imap-error";
import { ImapCommandError, ImapMutator } from "./imap-commands";
import type { ImapMessageRef } from "./imap-remote";
import { createMailboxCandidates, matchMailboxPath } from "./imap-uid-set";

export type { ImapMessageRef };

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

/** CREATE on the IMAP server, then persist the folder with the LIST path. */
export async function createImapMailbox(
  mailbox: Mailbox,
  env: CloudflareEnv,
  db: Database,
  name: string,
): Promise<Folder> {
  const credentials = await imapAuth(mailbox, env, db);
  const session = await ImapMutator.open(credentials);
  try {
    const listing = await session.listMailboxListing();
    const existing = matchMailboxPath(listing.paths, name);
    if (existing) {
      return await upsertRemoteFolder(db, mailbox.id, name, existing, "custom");
    }

    const namespace =
      (await session.personalNamespace()) ??
      (listing.delimiter ? { prefix: "", delimiter: listing.delimiter } : null);
    const candidates = createMailboxCandidates(name, namespace, listing.paths);
    let createdPath: string | null = null;
    let lastNo: string | undefined;
    for (const candidate of candidates) {
      try {
        await session.createMailbox(candidate);
        createdPath = candidate;
        break;
      } catch (error) {
        if (!(error instanceof ImapCommandError) || error.status !== "NO") throw error;
        lastNo = error.text;
        if (/already exist/i.test(error.text)) {
          createdPath = candidate;
          break;
        }
      }
    }

    const paths = createdPath ? (await session.listMailboxListing()).paths : listing.paths;
    const path = matchMailboxPath(paths, name) ?? createdPath;
    if (!path) {
      throw new Error(folderCreateRejected(lastNo));
    }
    return await upsertRemoteFolder(db, mailbox.id, name, path, "custom");
  } finally {
    await session.close();
  }
}
