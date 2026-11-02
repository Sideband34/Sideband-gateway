/**
 * Per-key token bucket. In-process only (single gateway instance). The key
 * map is bounded so an attacker rotating keys cannot exhaust memory.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly nowMs: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  take(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = this.nowMs();
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      b = { tokens: this.capacity, at: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / this.refillPerSec)) };
  }
}
