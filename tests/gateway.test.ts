import { describe, expect, it } from 'vitest';
import {
  ChannelError,
  InMemoryChannelAdapter,
  NETWORK_PASSPHRASES,
  parseAmount,
  type Voucher,
} from '@sideband/channels';
import { GatewayError, type GatewayErrorCode } from '../src/errors.js';
import { SubmissionTimeoutError } from '../src/settlement/service.js';
import { S, activeSession, harness, payerKp, providerKp, strangerKp } from './helpers.js';
import { buildPreimage, createVoucher, keypairSigner } from '@sideband/channels';

async function code(p: Promise<unknown> | (() => unknown)): Promise<GatewayErrorCode | 'no_error'> {
  try {
    await (typeof p === 'function' ? p() : p);
    return 'no_error';
  } catch (e) {
    if (e instanceof GatewayError) return e.code;
    throw e;
  }
}

describe('session setup', () => {
  it('runs offer -> accept and exposes a protocol-shaped offer', async () => {
    const h = await harness();
    const offer = h.gw.createOffer();
    expect(offer).toMatchObject({
      type: 'service_offer',
      v: 1,
      network: 'testnet',
      pricePerUnit: '0.001',
      providerPublicKey: providerKp.publicKey(),
    });
    await h.gw.acceptSession({
      session: offer.session,
      channelRef: h.channelId,
      maxSpend: S,
      nonce: 'n1',
    });
    expect((await h.gw.usage(offer.session)).phase).toBe('active');
  });

  it('refuses an unfunded / unknown channel', async () => {
    const h = await harness();
    const o = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: 'C' + 'A'.repeat(55),
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('no_funded_channel');
  });

  it('refuses a channel on the wrong network', async () => {
    const h = await harness({ channelNetwork: NETWORK_PASSPHRASES.futurenet });
    const o = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: h.channelId,
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('wrong_network');
  });

  it('refuses a channel bound to a different provider', async () => {
    const h = await harness({ channelProvider: strangerKp.publicKey() });
    const o = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: h.channelId,
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('wrong_provider');
  });

  it('refuses an unauthorized payer when an allow-list is configured', async () => {
    const h = await harness({ allowedPayers: new Set([strangerKp.publicKey()]) });
    const o = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: h.channelId,
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('unauthorized_payer');
  });

  it('rejects a stale offer and an expired channel', async () => {
    const h = await harness();
    const o = h.gw.createOffer();
    h.clock.t += 301;
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: h.channelId,
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('offer_expired');
    const h2 = await harness({ channelExpiresAt: 1_100 });
    const o2 = h2.gw.createOffer();
    h2.clock.t = 1_100;
    expect(
      await code(
        h2.gw.acceptSession({
          session: o2.session,
          channelRef: h2.channelId,
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('channel_expired');
  });

  it('rejects a replayed accept nonce', async () => {
    const h = await harness();
    const a = h.gw.createOffer();
    await h.gw.acceptSession({
      session: a.session,
      channelRef: h.channelId,
      maxSpend: S,
      nonce: 'same',
    });
    h.gw.closeSession(a.session);
    const b = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: b.session,
          channelRef: h.channelId,
          maxSpend: S,
          nonce: 'same',
        }),
      ),
    ).toBe('replayed_nonce');
  });

  it('enforces budget caps at accept: offer cap and channel deposit', async () => {
    const h = await harness({ deposit: 2n * S, env: { MAX_SESSION_UNITS: '10000' } });
    const o = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: h.channelId,
          maxSpend: 3n * S,
          nonce: 'x',
        }),
      ),
    ).toBe('spend_exceeds_deposit');
    const h2 = await harness({ env: { MAX_SESSION_UNITS: '100' } }); // cap = 0.1
    const o2 = h2.gw.createOffer();
    expect(
      await code(
        h2.gw.acceptSession({
          session: o2.session,
          channelRef: h2.channelId,
          maxSpend: S,
          nonce: 'x',
        }),
      ),
    ).toBe('spend_exceeds_offer');
  });

  it('allows one active session per channel', async () => {
    const h = await harness();
    await activeSession(h);
    const o = h.gw.createOffer();
    expect(
      await code(
        h.gw.acceptSession({
          session: o.session,
          channelRef: h.channelId,
          maxSpend: S,
          nonce: 'y',
        }),
      ),
    ).toBe('channel_in_use');
  });

  it('rejects accept for unknown or already-active sessions', async () => {
    const h = await harness();
    expect(
      await code(
        h.gw.acceptSession({ session: 'nope', channelRef: h.channelId, maxSpend: S, nonce: 'x' }),
      ),
    ).toBe('unknown_session');
    const id = await activeSession(h);
    expect(
      await code(
        h.gw.acceptSession({ session: id, channelRef: h.channelId, maxSpend: S, nonce: 'z' }),
      ),
    ).toBe('bad_state');
  });
});

describe('vouchers and metered service', () => {
  it('refuses service until a voucher covers it, then serves and meters', async () => {
    const h = await harness();
    const id = await activeSession(h);
    const err = await h.gw.serve(id, 'hello brave new world').catch((e: GatewayError) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as GatewayError).code).toBe('payment_required');
    expect((err as GatewayError).extra).toMatchObject({ requiredCumulative: '0.004' });

    expect(await h.gw.submitVoucher(id, h.voucher('0.004'))).toMatchObject({
      status: 'COMMITMENT_ACCEPTED_NOT_SETTLED',
    });
    const out = await h.gw.serve(id, 'hello brave new world');
    expect(out).toMatchObject({
      output: 'HELLO BRAVE NEW WORLD',
      units: 4,
      cumulativeUnits: 4,
      owed: '0.004',
    });
    const u = await h.gw.usage(id);
    expect(u).toMatchObject({
      units: 4,
      owed: '0.004',
      highestVoucher: '0.004',
      unpaid: '0',
      settlement: 'NOT_SETTLED',
    });
  });

  it('rejects replayed and rolled-back vouchers', async () => {
    const h = await harness();
    const id = await activeSession(h);
    const v2 = h.voucher('0.2');
    await h.gw.submitVoucher(id, v2);
    expect(await code(h.gw.submitVoucher(id, v2))).toBe('replay');
    expect(await code(h.gw.submitVoucher(id, h.voucher('0.1')))).toBe('non_monotonic');
    expect((await h.gw.usage(id)).highestVoucher).toBe('0.2');
  });

  it('rejects vouchers over the session budget and over the deposit', async () => {
    const h = await harness();
    const id = await activeSession(h, '0.5');
    expect(await code(h.gw.submitVoucher(id, h.voucher('0.6')))).toBe('over_budget');
  });

  it('rejects vouchers from an unauthorized key (foreign domain and forged signature)', async () => {
    const h = await harness();
    const id = await activeSession(h);
    const foreign = createVoucher(
      keypairSigner(strangerKp),
      { ...h.domain, payer: strangerKp.publicKey() },
      parseAmount('0.1'),
    );
    expect(await code(h.gw.submitVoucher(id, foreign))).toBe('commitment_mismatch');
    // attacker signs the genuine preimage with their own key
    const pre = buildPreimage(h.domain, parseAmount('0.1'));
    const good = h.voucher('0.1');
    const forged = {
      ...good,
      signature: Buffer.from(strangerKp.sign(Buffer.from(pre))).toString('hex'),
    };
    expect(await code(h.gw.submitVoucher(id, forged))).toBe('bad_signature');
    expect((await h.gw.usage(id)).highestVoucher).toBe('0');
  });

  it('rejects vouchers for another channel and for another network domain', async () => {
    const h = await harness();
    const id = await activeSession(h);
    const other = await h.adapter.open({
      networkPassphrase: NETWORK_PASSPHRASES.testnet,
      payer: payerKp.publicKey(),
      provider: providerKp.publicKey(),
      asset: 'TEST-TOKEN',
      deposit: S,
      expiresAt: 100_000,
      idempotencyKey: 'other',
    });
    const v: Voucher = createVoucher(
      keypairSigner(payerKp),
      { ...h.domain, channelId: other.binding.channelId },
      parseAmount('0.1'),
    );
    expect(await code(h.gw.submitVoucher(id, v))).toBe('wrong_channel');
    const crossNet = createVoucher(
      keypairSigner(payerKp),
      { ...h.domain, networkPassphrase: NETWORK_PASSPHRASES.futurenet },
      parseAmount('0.1'),
    );
    expect(await code(h.gw.submitVoucher(id, crossNet))).toBe('wrong_network');
  });

  it('rejects vouchers after channel expiry', async () => {
    const h = await harness({ channelExpiresAt: 2_000 });
    const id = await activeSession(h);
    h.clock.t = 2_000;
    expect(await code(h.gw.submitVoucher(id, h.voucher('0.1')))).toBe('channel_expired');
  });

  it('enforces the unit cap', async () => {
    const h = await harness({ env: { MAX_SESSION_UNITS: '3', PRICE_PER_UNIT: '0.001' } });
    const id = await activeSession(h, '0.003');
    await h.gw.submitVoucher(id, h.voucher('0.003'));
    expect(await code(h.gw.serve(id, 'a b c d'))).toBe('unit_cap');
    expect((await h.gw.serve(id, 'a b c')).cumulativeUnits).toBe(3);
    expect(await code(h.gw.serve(id, 'again'))).toBe('unit_cap');
  });

  it('never over-serves under concurrent requests (per-session lock)', async () => {
    const h = await harness();
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.003')); // covers exactly 3 words
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => h.gw.serve(id, 'word')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await h.gw.usage(id)).units).toBe(3);
  });

  it('tolerates a configured credit allowance but never beyond it', async () => {
    const h = await harness({ env: { CREDIT_ALLOWANCE: '0.002' } });
    const id = await activeSession(h);
    await h.gw.serve(id, 'a b');
    expect(await code(h.gw.serve(id, 'c'))).toBe('payment_required');
  });

  it('rejects empty or oversize input', async () => {
    const h = await harness();
    const id = await activeSession(h);
    expect(await code(h.gw.serve(id, '   '))).toBe('invalid_request');
    expect(await code(h.gw.serve(id, 'x'.repeat(2001)))).toBe('invalid_request');
  });

  it('reports meter discrepancy between payer and provider counts', async () => {
    const h = await harness();
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.002'));
    await h.gw.serve(id, 'one two');
    expect(h.gw.reportMeter(id, { seq: 1, cumulativeUnits: 2 })).toMatchObject({
      match: true,
      discrepancyUnits: 0,
    });
    expect(h.gw.reportMeter(id, { seq: 1, cumulativeUnits: 1 })).toMatchObject({
      match: false,
      discrepancyUnits: -1,
    });
  });
});

describe('settlement preparation', () => {
  async function paidSession() {
    const h = await harness();
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.004'));
    await h.gw.serve(id, 'a b c d');
    return { h, id };
  }

  it('submits the highest voucher and stays SUBMITTED (synthetic adapter has no finality)', async () => {
    const { h } = await paidSession();
    const i = await h.gw.settle(h.channelId);
    expect(i).toMatchObject({ state: 'SUBMITTED', amount: parseAmount('0.004') });
    expect(i.txHash).toMatch(/^synthetic:close:/);
    expect((await h.adapter.getBinding(h.channelId))?.settledToProvider).toBe(parseAmount('0.004'));
    // idempotent: same intent again, no second close
    expect((await h.gw.settle(h.channelId)).id).toBe(i.id);
    expect((await h.gw.channelStatus(h.channelId)).settlement?.state).toBe('SUBMITTED');
  });

  it('only CONFIRMS with matching finality evidence', async () => {
    const { h } = await paidSession();
    const i = await h.gw.settle(h.channelId);
    const bad = () =>
      h.settlement.confirm(h.channelId, {
        network: NETWORK_PASSPHRASES.futurenet,
        txHash: i.txHash!,
        ledger: 5,
      });
    expect(bad).toThrow(GatewayError);
    expect(
      h.settlement.confirm(h.channelId, {
        network: NETWORK_PASSPHRASES.testnet,
        txHash: i.txHash!,
        ledger: 5,
      }).state,
    ).toBe('CONFIRMED');
  });

  it('locks the amount once settling: later vouchers are refused', async () => {
    const { h, id } = await paidSession();
    await h.gw.settle(h.channelId);
    expect(await code(h.gw.submitVoucher(id, h.voucher('0.9')))).toBe('channel_settling');
  });

  it('timeout after submission goes to RECONCILING, never FAILED, and is not blindly retried', async () => {
    let closes = 0;
    const h = await harness({
      adapter: (now) =>
        new (class extends InMemoryChannelAdapter {
          override async close(): Promise<never> {
            closes++;
            throw new SubmissionTimeoutError('tx-hash-1');
          }
        })(now),
    });
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.1'));
    const i = await h.gw.settle(h.channelId);
    expect(i).toMatchObject({ state: 'RECONCILING', txHash: 'tx-hash-1' });
    await h.gw.settle(h.channelId);
    expect(closes).toBe(1);
    expect(
      h.settlement.confirm(h.channelId, {
        network: NETWORK_PASSPHRASES.testnet,
        txHash: 'tx-hash-1',
        ledger: 9,
      }).state,
    ).toBe('CONFIRMED');
  });

  it('payer refunded after provider outage: settlement is refused as channel_not_open', async () => {
    const h = await harness({ channelExpiresAt: 2_000 });
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.1'));
    h.clock.t = 2_000;
    await h.adapter.refund(h.channelId);
    expect(await code(h.gw.settle(h.channelId))).toBe('channel_not_open');
    expect((await h.gw.channelStatus(h.channelId)).onChainStatus).toBe('refunded');
  });

  it('chain rejection at submit time (stale cached binding) ends FAILED with the reason', async () => {
    const h = await harness({
      adapter: (now) =>
        new (class extends InMemoryChannelAdapter {
          override async close(): Promise<never> {
            throw new ChannelError('already_settled', 'Channel is refunded');
          }
        })(now),
    });
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.1'));
    const i = await h.gw.settle(h.channelId);
    expect(i.state).toBe('FAILED');
    expect(i.failure).toMatch(/already_settled/);
  });

  it('refuses to settle without a voucher or for an unknown channel', async () => {
    const h = await harness();
    expect(await code(h.gw.settle(h.channelId))).toBe('bad_state');
    expect(await code(h.gw.settle('C' + 'A'.repeat(55)))).toBe('unknown_channel');
  });
});

describe('provider shutdown', () => {
  it('stops new work, closes sessions and prepares settlement for accepted value', async () => {
    const h = await harness();
    const id = await activeSession(h);
    await h.gw.submitVoucher(id, h.voucher('0.05'));
    const intents = await h.gw.shutdown();
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ state: 'CREATED', amount: parseAmount('0.05') });
    expect(h.gw.isShuttingDown).toBe(true);
    expect((await h.gw.usage(id)).closeReason).toBe('provider_shutdown');
    expect(await code(() => h.gw.createOffer())).toBe('shutting_down');
    expect(await code(h.gw.serve(id, 'x'))).toBe('shutting_down');
    expect(await code(h.gw.submitVoucher(id, h.voucher('0.06')))).toBe('bad_state');
    // the prepared intent can still be submitted after shutdown
    expect((await h.gw.settle(h.channelId)).state).toBe('SUBMITTED');
  });
});
