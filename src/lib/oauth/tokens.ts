import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { Database } from "@/lib/db";
import { mailboxes } from "@/lib/db/schema";
import {
  oauthReady,
  refreshAccessToken,
  type OauthProviderId,
  type OauthTokenSet,
} from "@/lib/oauth/providers";

type MailboxRow = typeof mailboxes.$inferSelect;

const REFRESH_SKEW_MS = 60_000;

export async function encryptOauthTokens(
  tokens: OauthTokenSet,
  key: string | undefined,
): Promise<string> {
  return encryptSecret(JSON.stringify(tokens), key);
}

export async function decryptOauthTokens(
  payload: string,
  key: string | undefined,
): Promise<OauthTokenSet> {
  const parsed = JSON.parse(await decryptSecret(payload, key)) as Partial<OauthTokenSet>;
  if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
    throw new Error("Stored mail tokens are unreadable.");
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
  };
}

export async function accessTokenForMailbox(
  mailbox: MailboxRow,
  env: CloudflareEnv,
  db?: Database,
): Promise<string> {
  if (!mailbox.oauthProvider || !mailbox.oauthTokens) {
    throw new Error("This mailbox is not connected with one-click sign-in.");
  }
  if (!oauthReady(env, mailbox.oauthProvider)) {
    throw new Error(`${mailbox.oauthProvider} sign-in is not configured.`);
  }

  let tokens = await decryptOauthTokens(mailbox.oauthTokens, env.MAIL_ENCRYPTION_KEY);
  if (tokens.expiresAt > Date.now() + REFRESH_SKEW_MS) return tokens.accessToken;

  tokens = await refreshAccessToken(env, mailbox.oauthProvider, tokens.refreshToken);
  if (db) {
    await db
      .update(mailboxes)
      .set({ oauthTokens: await encryptOauthTokens(tokens, env.MAIL_ENCRYPTION_KEY) })
      .where(eq(mailboxes.id, mailbox.id));
  }
  return tokens.accessToken;
}

export function isOauthMailbox(
  mailbox: Pick<MailboxRow, "oauthProvider" | "oauthTokens">,
): mailbox is MailboxRow & { oauthProvider: OauthProviderId; oauthTokens: string } {
  return Boolean(mailbox.oauthProvider && mailbox.oauthTokens);
}
