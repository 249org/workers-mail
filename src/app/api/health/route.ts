import { sql } from "drizzle-orm";
import { authenticate, errorResponse } from "@/lib/auth/api";
import { env as cloudflareEnv } from "@/lib/env";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { cloudflareApi } from "@/lib/cloudflare/api";

type Check = { name: string; ok: boolean; detail: string };

/** Surfaces the binding and secret state the settings page reports on. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { db, env } = await authenticate(request, cloudflareEnv());
    const checks: Check[] = [];

    checks.push(
      await probe("Database", async () => {
        await db.get(sql`select 1`);
        return "D1 responded.";
      }),
    );

    checks.push(
      await probe("Object storage", async () => {
        await env.MAIL_BUCKET.head("healthcheck");
        return "R2 bucket is reachable.";
      }),
    );

    checks.push(
      await probe("Encryption key", async () => {
        if (!env.MAIL_ENCRYPTION_KEY) {
          throw new Error("MAIL_ENCRYPTION_KEY is unset; IMAP mailboxes are disabled.");
        }
        const probeValue = "workers-mail";
        const roundTripped = await decryptSecret(
          await encryptSecret(probeValue, env.MAIL_ENCRYPTION_KEY),
          env.MAIL_ENCRYPTION_KEY,
        );
        if (roundTripped !== probeValue) throw new Error("Round trip did not match.");
        return "AES-GCM round trip succeeded.";
      }),
    );

    const api = cloudflareApi(env);
    checks.push({
      name: "Cloudflare API token",
      ok: api.configured,
      detail: api.configured
        ? "Domain provisioning is available."
        : "Unset; domains must be verified by hand.",
    });

    return Response.json({ ok: checks.every((check) => check.ok), checks });
  } catch (error) {
    return errorResponse(error);
  }
}

async function probe(name: string, run: () => Promise<string>): Promise<Check> {
  try {
    return { name, ok: true, detail: await run() };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
