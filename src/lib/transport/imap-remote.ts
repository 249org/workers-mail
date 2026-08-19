export type ImapMessageRef = {
  id: string;
  folderId: string;
  remoteUid: number | null;
};

export type RemoteMailChange =
  | { action: "flags"; seen?: boolean; flagged?: boolean }
  | { action: "move"; folderId: string }
  | { action: "delete" };

export type RemoteMailResult =
  | { ok: true; uids: Array<[string, number | null]> }
  | { ok: false };

export type CreatedFolder = {
  id: string;
  name: string;
  role: "custom";
  unread: number;
};

export type CreateFolderResult =
  | { ok: true; folder: CreatedFolder }
  | { ok: false; error: string };

export async function applyRemoteMail(
  env: CloudflareEnv,
  mailboxId: string,
  refs: ImapMessageRef[],
  change: RemoteMailChange,
): Promise<Map<string, number | null>> {
  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
  const result = (await stub.applyRemote({ mailboxId, refs, change })) as RemoteMailResult;
  if (!result.ok) throw new Error("imap apply failed");
  return new Map(result.uids);
}

export async function createRemoteFolder(
  env: CloudflareEnv,
  mailboxId: string,
  name: string,
): Promise<CreatedFolder> {
  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
  const result = (await stub.createRemoteFolder({ mailboxId, name })) as CreateFolderResult;
  if (!result.ok) throw new Error(result.error);
  return result.folder;
}

export type FolderMutationResult =
  | { ok: true; remotePath?: string }
  | { ok: false; error: string };

/** Mirrors a rename or delete onto the IMAP server via the mailbox's Durable Object. */
export async function mutateRemoteFolder(
  env: CloudflareEnv,
  mailboxId: string,
  folderId: string,
  action: "rename" | "delete",
  name?: string,
): Promise<FolderMutationResult> {
  const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
  return (await stub.mutateRemoteFolder({
    mailboxId,
    folderId,
    action,
    name,
  })) as FolderMutationResult;
}
