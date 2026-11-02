import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../src/http/server.js';
import { harness, type Harness } from './helpers.js';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

async function start(h?: Harness) {
  const hh = h ?? (await harness());
  server = createHttpServer(hh.gw);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown, raw?: string) => {
    const res = await fetch(base + path, {
      method,
      ...(body !== undefined || raw !== undefined
        ? { headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) }
        : {}),
    });
    return {
      status: res.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: (await res.json()) as Record<string, any>,
      headers: res.headers,
    };
  };
  return { h: hh, call };
}

describe('HTTP API v1', () => {
  it('serves health and a signed manifest', async () => {
    const { call } = await start();
    const health = await call('GET', '/v1/health');
    expect(health.status).toBe(200);
    expect(health.json).toMatchObject({ status: 'ok', schemaVersion: 1 });
    const m = await call('GET', '/.well-known/sideband-service.json');
    expect(m.json.manifest.network).toBe('testnet');
    expect(m.json.signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it('runs a full metered session over HTTP with honest settlement states', async () => {
    const { h, call } = await start();
    const offer = (await call('POST', '/v1/sessions/offer', { schemaVersion: 1 })).json;
    expect(offer.type).toBe('service_offer');

    const acc = await call('POST', '/v1/sessions/accept', {
      type: 'session_accept',
      v: 1,
      session: offer.session,
      channelRef: h.channelId,
      maxSpend: '1',
      nonce: 'http-n1',
    });
    expect(acc.json).toMatchObject({ status: 'active' });

    const unpaid = await call('POST', `/v1/sessions/${offer.session}/serve`, {
      text: 'hello there',
    });
    expect(unpaid.status).toBe(402);
    expect(unpaid.json.error).toMatchObject({
      code: 'payment_required',
      requiredCumulative: '0.002',
    });
    expect(typeof unpaid.json.error.requestId).toBe('string');

    const v = h.voucher('0.002');
    const vr = await call('POST', `/v1/sessions/${offer.session}/vouchers`, {
      type: 'voucher',
      v: 1,
      session: offer.session,
      ...v,
    });
    expect(vr.status).toBe(200);
    expect(vr.json.status).toBe('COMMITMENT_ACCEPTED_NOT_SETTLED');

    const replay = await call('POST', `/v1/sessions/${offer.session}/vouchers`, {
      type: 'voucher',
      v: 1,
      session: offer.session,
      ...v,
    });
    expect(replay.status).toBe(409);
    expect(replay.json.error.code).toBe('replay');

    const served = await call('POST', `/v1/sessions/${offer.session}/serve`, {
      text: 'hello there',
    });
    expect(served.json).toMatchObject({ output: 'HELLO THERE', units: 2 });

    const meter = await call('POST', `/v1/sessions/${offer.session}/meter`, {
      seq: 1,
      cumulativeUnits: 2,
    });
    expect(meter.json).toMatchObject({ match: true });

    const usage = await call('GET', `/v1/sessions/${offer.session}/usage`);
    expect(usage.json).toMatchObject({ units: 2, owed: '0.002', settlement: 'NOT_SETTLED' });

    const settle = await call('POST', `/v1/channels/${h.channelId}/settle`);
    expect(settle.status).toBe(202);
    expect(settle.json).toMatchObject({ state: 'SUBMITTED', amount: '0.002' });
    expect(settle.json.state).not.toBe('CONFIRMED');
    const status = await call('GET', `/v1/channels/${h.channelId}/status`);
    expect(status.json).toMatchObject({
      onChainStatus: 'closed',
      settlement: { state: 'SUBMITTED' },
    });
  });

  it('returns the documented error schema for bad input', async () => {
    const { call } = await start();
    const bad = await call('POST', '/v1/sessions/accept', { type: 'session_accept' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatchObject({ code: 'invalid_request' });
    const malformed = await call('POST', '/v1/sessions/offer', undefined, '{nope');
    expect(malformed.status).toBe(400);
    const unknown = await call('GET', '/v1/sessions/ghost/usage');
    expect(unknown.status).toBe(404);
    expect(unknown.json.error.code).toBe('unknown_session');
    const nf = await call('GET', '/nope');
    expect(nf.status).toBe(404);
    const strict = await call('POST', '/v1/sessions/offer', { schemaVersion: 1, extra: 1 });
    expect(strict.status).toBe(400);
  });

  it('rejects oversized bodies and echoes request ids', async () => {
    const { call } = await start();
    const big = await call(
      'POST',
      '/v1/sessions/offer',
      undefined,
      JSON.stringify({ pad: 'x'.repeat(20_000) }),
    );
    expect(big.status).toBe(400);
    expect(big.json.error.message).toMatch(/too large/);
    const r = await fetch(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1/health`, {
      headers: { 'x-request-id': 'abc-1' },
    });
    expect(r.headers.get('x-request-id')).toBe('abc-1');
  });

  it('health reports shutdown and offers are refused', async () => {
    const { h, call } = await start();
    await h.gw.shutdown();
    expect((await call('GET', '/v1/health')).json.status).toBe('shutting_down');
    const o = await call('POST', '/v1/sessions/offer', { schemaVersion: 1 });
    expect(o.status).toBe(503);
    expect(o.json.error.code).toBe('shutting_down');
  });
});
