/**
 * `.open-next/worker.js` is emitted by `opennextjs-cloudflare build` and does not exist
 * in a clean checkout. The Worker entry imports it through the `next-handler` alias
 * declared in wrangler.jsonc, which keeps this file typechecking before the first build.
 */
declare module "next-handler" {
  const handler: {
    fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response>;
  };
  export default handler;
}
