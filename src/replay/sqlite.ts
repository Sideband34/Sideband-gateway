import { DatabaseSync } from 'node:sqlite';
import type { StoredVoucher, VoucherStore, Voucher } from '@sideband/channels';
import type { NonceStore } from './nonces.js';

/** Opens (and migrates) the gateway's SQLite database. */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS vouchers (
      channel_id TEXT PRIMARY KEY,
      cumulative TEXT NOT NULL,      -- integer stroops as text (bigint-safe)
      voucher    TEXT NOT NULL       -- JSON
    );
    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY
    );
  `);
  return db;
}

/**
 * Durable voucher store. `compareAndSet` is a single SQL statement guarded by
 * the previous cumulative value, so concurrent writers cannot both win.
 */
export class SqliteVoucherStore implements VoucherStore {
  constructor(private readonly db: DatabaseSync) {}

  async get(channelId: string): Promise<StoredVoucher | undefined> {
    const row = this.db
      .prepare('SELECT cumulative, voucher FROM vouchers WHERE channel_id = ?')
      .get(channelId) as { cumulative: string; voucher: string } | undefined;
    if (!row) return undefined;
    return { cumulative: BigInt(row.cumulative), voucher: JSON.parse(row.voucher) as Voucher };
  }

  async compareAndSet(channelId: string, expected: bigint, next: StoredVoucher): Promise<boolean> {
    if (next.cumulative <= expected) return false;
    const json = JSON.stringify(next.voucher);
    if (expected === 0n) {
      const r = this.db
        .prepare(
          'INSERT OR IGNORE INTO vouchers (channel_id, cumulative, voucher) VALUES (?, ?, ?)',
        )
        .run(channelId, next.cumulative.toString(), json);
      return Number(r.changes) === 1;
    }
    const r = this.db
      .prepare(
        'UPDATE vouchers SET cumulative = ?, voucher = ? WHERE channel_id = ? AND cumulative = ?',
      )
      .run(next.cumulative.toString(), json, channelId, expected.toString());
    return Number(r.changes) === 1;
  }
}

export class SqliteNonceStore implements NonceStore {
  constructor(private readonly db: DatabaseSync) {}
  consume(nonce: string): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO nonces (nonce) VALUES (?)').run(nonce);
    return Number(r.changes) === 1;
  }
}
