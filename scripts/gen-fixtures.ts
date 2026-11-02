/**
 * Generates fixtures/session-transcript.json: a deterministic, SYNTHETIC
 * provider-side transcript (signed manifest + protocol v1 frames) that
 * sideband-mobile / sideband-protocol consumers decode in their own tests.
 * Keys are public test seeds; the channel is a TEST ADAPTER channel.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseAmount } from '@sideband/channels';
import { harness, payerKp, providerKp } from '../tests/helpers.js';

export async function buildTranscript() {
  const h = await harness({ newId: () => 'sess-fixture-0001' });
  const offer = h.gw.createOffer();
  const accept = {
    type: 'session_accept',
    v: 1,
    session: offer.session,
    channelRef: h.channelId,
    maxSpend: '1',
    nonce: 'nonce-fixture-0001',
  };
  await h.gw.acceptSession({
    session: offer.session,
    channelRef: h.channelId,
    maxSpend: parseAmount('1'),
    nonce: accept.nonce,
  });
  const voucherFrame = (amount: string) => ({
    type: 'voucher',
    v: 1,
    session: offer.session,
    ...h.voucher(amount),
  });
  const v1 = voucherFrame('0.002');
  const v2 = voucherFrame('0.004');
  await h.gw.submitVoucher(offer.session, h.voucher('0.004'));
  await h.gw.serve(offer.session, 'one two three four');
  const sample = h.gw.reportMeter(offer.session, { seq: 1, cumulativeUnits: 4 });
  return {
    warning:
      'SYNTHETIC transcript from the TEST channel adapter. Not a real session or settlement.',
    now: h.clock.t,
    network: 'testnet',
    providerPublicKey: providerKp.publicKey(),
    payerPublicKey: payerKp.publicKey(),
    channelId: h.channelId,
    manifest: h.gw.manifest(),
    frames: {
      service_offer: offer,
      session_accept: accept,
      voucher_low: v1,
      voucher_high: v2,
      meter_sample: {
        type: 'meter_sample',
        v: 1,
        session: offer.session,
        seq: sample.seq,
        cumulativeUnits: sample.cumulativeUnits,
        sampleHash: sample.sampleHash,
      },
      session_close: {
        type: 'session_close',
        v: 1,
        session: offer.session,
        reason: 'client_close',
      },
      error: {
        type: 'error',
        v: 1,
        session: offer.session,
        code: 'non_monotonic',
        message: 'Cumulative amount must strictly increase',
      },
    },
  };
}

if (process.argv[1]?.endsWith('gen-fixtures.ts')) {
  mkdirSync('fixtures', { recursive: true });
  writeFileSync(
    'fixtures/session-transcript.json',
    JSON.stringify(await buildTranscript(), null, 2) + '\n',
  );
  console.log('wrote fixtures/session-transcript.json');
}
