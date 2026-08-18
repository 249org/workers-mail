type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

/**
 * KV-backed fixed-window counter. Eventual consistency means a determined caller can
 * overshoot the limit slightly across colos; that is an acceptable trade for login and
 * send throttles, which only need to blunt abuse rather than meter exactly.
 */
export async function rateLimit(
  store: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const namespaced = `ratelimit:${key}`;
  const now = Date.now();
  const existing = await store.get<Bucket>(namespaced, "json");

  const bucket: Bucket =
    existing && existing.resetAt > now
      ? { count: existing.count + 1, resetAt: existing.resetAt }
      : { count: 1, resetAt: now + windowSeconds * 1000 };

  const ttl = Math.max(60, Math.ceil((bucket.resetAt - now) / 1000));
  await store.put(namespaced, JSON.stringify(bucket), { expirationTtl: ttl });

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export function clientKey(request: Request, suffix: string): string {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return `${suffix}:${ip}`;
}
