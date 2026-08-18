import { sha256Hex } from "@/lib/crypto";
import { randomToken } from "@/lib/ids";

const RESET_TTL_SECONDS = 60 * 60;

type ResetRecord = { userId: string };

export async function issuePasswordReset(
  store: KVNamespace,
  userId: string,
): Promise<string> {
  const token = randomToken(32);
  await store.put(resetKey(await sha256Hex(token)), JSON.stringify({ userId } satisfies ResetRecord), {
    expirationTtl: RESET_TTL_SECONDS,
  });
  return token;
}

export async function consumePasswordReset(
  store: KVNamespace,
  token: string,
): Promise<string | null> {
  const key = resetKey(await sha256Hex(token));
  const raw = await store.get(key);
  if (!raw) return null;
  await store.delete(key);
  try {
    const record = JSON.parse(raw) as ResetRecord;
    return record.userId || null;
  } catch {
    return null;
  }
}

function resetKey(hash: string): string {
  return `pw-reset:${hash}`;
}
