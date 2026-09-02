import nextHandler from "next-handler";
import { createDb } from "@/lib/db";
import { resolveRecipient } from "@/lib/mail/routing";
import { pollExternalMailboxes } from "./cron";
import { handleIngestBatch } from "./ingest";
import { handleSend, handleSetup, handleTestConnection, handleForgotPassword } from "./routes";
import { handleOauthCallback, handleOauthStart, parseOauthProvider } from "./oauth";
import { handleStream } from "./stream";
import { withSecurityHeaders } from "./security-headers";
import type { IngestJob } from "./types";

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const secure = url.protocol === "https:";
    const harden = (response: Response) => withSecurityHeaders(response, secure);

    // Handled here rather than in Next: a route handler cannot return a WebSocket
    // upgrade, and the mail transports need modules that only resolve in workerd.
    if (url.pathname === "/api/mail/stream") {
      return harden(await handleStream(request, env));
    }
    if (url.pathname === "/api/mail/send" && request.method === "POST") {
      return harden(await handleSend(request, env));
    }
    if (url.pathname === "/api/mail/test-connection" && request.method === "POST") {
      return harden(await handleTestConnection(request, env));
    }
    if (url.pathname === "/api/mail/setup" && request.method === "POST") {
      return harden(await handleSetup(request, env));
    }
    if (url.pathname === "/api/auth/password/forgot" && request.method === "POST") {
      return harden(await handleForgotPassword(request, env));
    }
    const oauth = parseOauthProvider(url.pathname);
    if (oauth && request.method === "GET") {
      return harden(
        oauth.callback
          ? await handleOauthCallback(request, env, oauth.provider)
          : await handleOauthStart(request, env, oauth.provider),
      );
    }

    return harden(await nextHandler.fetch(request, env, ctx));
  },

  /**
   * Cloudflare Email Routing delivers here. Routing is resolved inline because forwarding
   * and rejection are only available on the live message; everything past that point is
   * parked in R2 and handed to the queue so a slow parse never delays acceptance.
   */
  async email(message: ForwardableEmailMessage, env: CloudflareEnv): Promise<void> {
    const decision = await resolveRecipient(createDb(env.DB), message.to);

    if (decision.action === "forward") {
      await message.forward(decision.forwardTo);
      return;
    }
    if (decision.action === "drop") {
      message.setReject(decision.reason);
      return;
    }

    const inboundKey = `inbound/${crypto.randomUUID()}.eml`;
    await env.MAIL_BUCKET.put(inboundKey, message.raw, {
      httpMetadata: { contentType: "message/rfc822" },
    });

    const job: IngestJob = {
      inboundKey,
      mailboxId: decision.mailboxId,
      ownerId: decision.ownerId,
      to: message.to,
      from: message.from,
      size: message.rawSize,
      receivedAt: Date.now(),
    };
    await env.MAIL_INGEST.send(job);
  },

  async queue(batch: MessageBatch, env: CloudflareEnv): Promise<void> {
    await handleIngestBatch(batch as MessageBatch<IngestJob>, env);
  },

  async scheduled(
    _event: ScheduledController,
    env: CloudflareEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await pollExternalMailboxes(env);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { MailboxDurableObject } from "./mailbox-do";
