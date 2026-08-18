import { getCloudflareContext } from "@opennextjs/cloudflare";

export function env(): CloudflareEnv {
  return getCloudflareContext().env;
}

export async function envAsync(): Promise<CloudflareEnv> {
  const context = await getCloudflareContext({ async: true });
  return context.env;
}

export function waitUntil(promise: Promise<unknown>): void {
  getCloudflareContext().ctx.waitUntil(promise);
}
