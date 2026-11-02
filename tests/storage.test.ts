import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptVoucher, parseAmount } from '@sideband/channels';
import { SqliteNonceStore, SqliteVoucherStore, openDb } from '../src/replay/sqlite.js';
import { S, activeSession, harness } from './helpers.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'sbgw-'));
  dirs.push(d);
  return join(d, 'gw.db');
};

describe('SQLite voucher + nonce stores', () => {
  it('compare-and-set only succeeds against the expected previous value', async () => {
    const h = await harness();
    const db = openDb(':memory:');
    const store = new SqliteVoucherStore(db);
    const v1 = h.voucher('0.1');
    const v2 = h.voucher('0.2');
    expect(
      await store.compareAndSet(h.channelId, 0n, { cumulative: parseAmount('0.1'), voucher: v1 }),
    ).toBe(true);
    // stale writer (still thinks nothing stored) loses
    expect(
      await store.compareAndSet(h.channelId, 0n, { cumulative: parseAmount('0.2'), voucher: v2 }),
    ).toBe(false);
    // rollback refused
    expect(
      await store.compareAndSet(h.channelId, parseAmount('0.1'), {
        cumulative: parseAmount('0.05'),
        voucher: v1,
      }),
    ).toBe(false);
    expect(
      await store.compareAndSet(h.channelId, parseAmount('0.1'), {
        cumulative: parseAmount('0.2'),
        voucher: v2,
      }),
    ).toBe(true);
    expect((await store.get(h.channelId))?.voucher).toEqual(v2);
  });

  it('is linearizable under concurrent acceptVoucher calls', async () => {
    const h = await harness();
    const store = new SqliteVoucherStore(openDb(':memory:'));
    const policy = {
      deposit: 10n * S,
      maxSpend: 10n * S,
      expiresAt: 100_000,
      now: () => 1_000,
      maxRetries: 50,
    };
    const amounts = ['1', '2', '3', '4', '5', '5', '2', '1'];
    const rs = await Promise.all(
      amounts.map((a) => acceptVoucher(h.domain, policy, store, h.voucher(a))),
    );
    expect((await store.get(h.channelId))?.cumulative).toBe(5n * S);
    expect(rs.reduce((acc, r) => (r.ok ? acc + r.delta : acc), 0n)).toBe(5n * S);
  });

  it('survives a restart: replay and rollback are still rejected, nonces stay consumed', async () => {
    const path = tmp();
    const db1 = openDb(path);
    const h1 = await harness({
      vouchers: new SqliteVoucherStore(db1),
      nonces: new SqliteNonceStore(db1),
    });
    const id = await activeSession(h1);
    const v = h1.voucher('0.3');
    await h1.gw.submitVoucher(id, v);
    db1.close();

    const db2 = openDb(path);
    const store2 = new SqliteVoucherStore(db2);
    const policy = { deposit: 10n * S, maxSpend: 10n * S, expiresAt: 100_000, now: () => 1_000 };
    expect(await acceptVoucher(h1.domain, policy, store2, v)).toMatchObject({
      ok: false,
      code: 'replay',
    });
    expect(await acceptVoucher(h1.domain, policy, store2, h1.voucher('0.1'))).toMatchObject({
      ok: false,
      code: 'non_monotonic',
    });
    const nonces2 = new SqliteNonceStore(db2);
    expect(nonces2.consume('nonce-from-before')).toBe(true);
    expect(nonces2.consume('nonce-from-before')).toBe(false);
    db2.close();
  });
});
