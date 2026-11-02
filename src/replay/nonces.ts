/** One-time `session_accept.nonce` registry (anti-replay of accept frames). */
export interface NonceStore {
  /** Returns true if the nonce was fresh and is now consumed. Atomic. */
  consume(nonce: string): boolean;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly seen = new Set<string>();
  consume(nonce: string): boolean {
    if (this.seen.has(nonce)) return false;
    this.seen.add(nonce);
    return true;
  }
}
