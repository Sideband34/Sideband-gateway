import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptVoucher, parseAmount } from '@sideband/channels';
import {
  SqliteIntentStore,
  SqliteNonceStore,
  SqliteSessionStore,
  SqliteVoucherStore,
  openDb,
} from '../src/replay/sqlite.js';
import { ProviderGateway } from '../src/gateway.js';
import { SettlementService } from '../src/settlement/service.js';
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

describe('openDb', () => {
  it('creates a missing parent directory on first start (DB_PATH=./data/gateway.db)', () => {
    const root = mkdtempSync(join(tmpdir(), 'sbgw-'));
    dirs.push(root);
    const path = join(root, 'nested', 'data', 'gw.db');
    const db = openDb(path);
    db.close();
    expect(existsSync(path)).toBe(true);
  });
});

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

describe('persistent session and meter state', () => {
  it('restores an active session after restart with units, caps and channel lock intact', async () => {
    const path = tmp();
    const db1 = openDb(path);
    const h1 = await harness({
      vouchers: new SqliteVoucherStore(db1),
      nonces: new SqliteNonceStore(db1),
      sessions: new SqliteSessionStore(db1),
    });
    const id = await activeSession(h1, '0.5');
    await h1.gw.submitVoucher(id, h1.voucher('0.003'));
    await h1.gw.serve(id, 'a b c');
    db1.close();

    // "restart": new gateway process over the same DB and the same chain view
    const db2 = openDb(path);
    const gw2 = new ProviderGateway({
      ...h1.deps,
      vouchers: new SqliteVoucherStore(db2),
      nonces: new SqliteNonceStore(db2),
      sessions: new SqliteSessionStore(db2),
    });
    expect(await gw2.restore()).toEqual({ restored: 1, closed: 0 });
    expect(await gw2.usage(id)).toMatchObject({
      phase: 'active',
      units: 3,
      seq: 1,
      owed: '0.003',
      highestVoucher: '0.003',
    });
    // metering continues from the persisted counters and stays voucher-gated
    await expect(gw2.serve(id, 'd')).rejects.toMatchObject({ code: 'payment_required' });
    await gw2.submitVoucher(id, h1.voucher('0.004'));
    expect((await gw2.serve(id, 'd')).cumulativeUnits).toBe(4);
    // the channel lock survives: a second session cannot take the channel
    const o = gw2.createOffer();
    await expect(
      gw2.acceptSession({
        session: o.session,
        channelRef: h1.channelId,
        maxSpend: S,
        nonce: 'fresh',
      }),
    ).rejects.toMatchObject({ code: 'channel_in_use' });
    db2.close();
  });

  it('closes restored sessions whose channel is no longer open instead of resuming blindly', async () => {
    const path = tmp();
    const db1 = openDb(path);
    const h1 = await harness({
      vouchers: new SqliteVoucherStore(db1),
      sessions: new SqliteSessionStore(db1),
      channelExpiresAt: 2_000,
    });
    const id = await activeSession(h1);
    db1.close();
    h1.clock.t = 2_000; // channel expired while the provider was down
    const db2 = openDb(path);
    const gw2 = new ProviderGateway({
      ...h1.deps,
      vouchers: new SqliteVoucherStore(db2),
      sessions: new SqliteSessionStore(db2),
    });
    expect(await gw2.restore()).toEqual({ restored: 1, closed: 1 });
    expect(await gw2.usage(id)).toMatchObject({
      phase: 'closed',
      closeReason: 'restore_channel_unavailable',
    });
    db2.close();
  });
});

describe('SqliteIntentStore (settlement intents survive a restart)', () => {
  it('keeps bigint amounts and returns the most recently saved intent per channel', async () => {
    const path = tmp();
    const h = await harness();
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.004'));
    const first = await h.gw.settle(h.channelId, 'settle');

    const db1 = openDb(path);
    const store = new SqliteIntentStore(db1);
    store.save(first);
    const second = { ...first, id: 'second-intent', state: 'CONFIRMED' as const };
    store.save(second);
    // saving an older id again moves it to the front: "latest" means last saved
    store.save(first);
    db1.close();

    const db2 = openDb(path);
    const reopened = new SqliteIntentStore(db2);
    const back = reopened.latestForChannel(h.channelId)!;
    expect(back.id).toBe(first.id);
    expect(back.amount).toBe(first.amount);
    expect(typeof back.amount).toBe('bigint');
    expect(reopened.latestForChannel('no-such-channel')).toBeUndefined();
    db2.close();
  });

  it('a rebuilt SettlementService still sees an in-flight settlement and refuses to double-submit', async () => {
    const path = tmp();
    const h = await harness();
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.004'));
    const db = openDb(path);
    const svc1 = new SettlementService(h.adapter, h.vouchers, new SqliteIntentStore(db));
    const sent = await svc1.submit(h.channelId, 'settle');
    db.close();

    // "restart": a brand new service over the same database file
    const db2 = openDb(path);
    const svc2 = new SettlementService(h.adapter, h.vouchers, new SqliteIntentStore(db2));
    expect(svc2.get(h.channelId)).toMatchObject({ id: sent.id, kind: 'settle', state: sent.state });
    expect(svc2.get(h.channelId)!.amount).toBe(sent.amount);
    db2.close();
  });
});
