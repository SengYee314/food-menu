const WINDOW_MS = 10 * 60 * 1000;

export async function orderRateLimitStatement(db: D1Database, request: Request): Promise<D1PreparedStatement | null> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || ip.length > 64) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const fingerprint = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = `${Math.floor(Date.now() / WINDOW_MS)}:${fingerprint}`;
  // The CHECK constraint in migration 0001 aborts the entire order batch when
  // this reaches a fifth successful order in the same ten-minute window.
  return db.prepare("INSERT INTO order_rate_limits (key, attempts) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1").bind(key);
}
