import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StoredVoucher, VoucherStore, Voucher } from '@sideband/channels';
import type { SessionRecord, SessionStore } from '../gateway.js';
import type { NonceStore } from './nonces.js';
import type { IntentStore } from '../settlement/service.js';
import type { SettlementIntent } from '@sideband/channels';

/** Opens (and migrates) the gateway's SQLite database. */
export function openDb(path: string): DatabaseSync {
  // DB_PATH=./data/gateway.db must work on a first start; only create a directory for real files.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS vouchers (
      channel_id TEXT PRIMARY KEY,
      cumulative TEXT NOT NULL,      -- integer stroops as text (bigint-safe)
      voucher    TEXT NOT NULL       -- JSON
    );
    CREATE TABLE IF NOT EXISTS intents (
      id         TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      seq        INTEGER NOT NULL,   -- save order; the highest seq per channel is the latest intent
      json       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS intents_channel ON intents (channel_id, seq);
    CREATE TABLE IF NOT EXISTS sessions (
      id   TEXT PRIMARY KEY,
      json TEXT NOT NULL
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

/** Durable session/meter snapshots (JSON rows keyed by session id). */
export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: DatabaseSync) {}
  save(rec: SessionRecord): void {
    this.db
      .prepare(
        'INSERT INTO sessions (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json',
      )
      .run(rec.id, JSON.stringify(rec));
  }
  loadAll(): SessionRecord[] {
    return (this.db.prepare('SELECT json FROM sessions').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as SessionRecord,
    );
  }
}

// bigint-safe JSON for settlement intents (amount is a bigint)
const replacer = (_k: string, v: unknown) =>
  typeof v === 'bigint' ? { $bigint: v.toString() } : v;
const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '$bigint' in v ? BigInt((v as { $bigint: string }).$bigint) : v;

/** Durable settlement intents: a restart no longer forgets an in-flight or confirmed settlement. */
export class SqliteIntentStore implements IntentStore {
  constructor(private readonly db: DatabaseSync) {}
  latestForChannel(channelId: string): SettlementIntent | undefined {
    const row = this.db
      .prepare('SELECT json FROM intents WHERE channel_id = ? ORDER BY seq DESC LIMIT 1')
      .get(channelId) as { json: string } | undefined;
    return row ? (JSON.parse(row.json, reviver) as SettlementIntent) : undefined;
  }
  save(i: SettlementIntent): void {
    this.db
      .prepare(
        `INSERT INTO intents (id, channel_id, seq, json)
         VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM intents), ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, seq = excluded.seq`,
      )
      .run(i.id, i.channelId, JSON.stringify(i, replacer));
  }
}
