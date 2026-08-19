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
