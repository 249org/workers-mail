import type { MailboxDurableObject } from "./worker/mailbox-do";

declare global {
  interface CloudflareEnv {
    ASSETS: Fetcher;
    DB: D1Database;
    MAIL_BUCKET: R2Bucket;
    SESSION_STORE: KVNamespace;
    MAILBOX: DurableObjectNamespace<MailboxDurableObject>;
    MAIL_INGEST: Queue<import("./worker/types").IngestJob>;
    EMAIL: SendEmail;

    APP_NAME: string;
    MAIL_ENCRYPTION_KEY?: string;
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    AUTH_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    MICROSOFT_CLIENT_ID?: string;
    MICROSOFT_CLIENT_SECRET?: string;
  }
}

export {};
