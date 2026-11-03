import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer, type HttpOptions } from '../src/http/server.js';
import { RateLimiter } from '../src/http/ratelimit.js';
import { sessionToken } from '../src/http/auth.js';
import { harness, type Harness } from './helpers.js';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

const SECRET = Buffer.from('test-session-secret-0123456789ab');
const ADMIN = 'test-admin-token';

async function start(h?: Harness, opts: Partial<HttpOptions> = {}) {
  const hh = h ?? (await harness());
  server = createHttpServer(hh.gw, { sessionSecret: SECRET, adminToken: ADMIN, ...opts });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    raw?: string,
    headers: Record<string, string> = {},
  ) => {
    const res = await fetch(base + path, {
      method,
      ...(body !== undefined || raw !== undefined
        ? {
            headers: { 'content-type': 'application/json', ...headers },
            body: raw ?? JSON.stringify(body),
          }
        : { headers }),
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
    const offerRes = await call('POST', '/v1/sessions/offer', { schemaVersion: 1 });
    const offer = offerRes.json;
    const auth = { authorization: `Bearer ${offerRes.headers.get('x-sideband-session-token')}` };
    const admin = { 'x-admin-token': ADMIN };
    expect(offer.type).toBe('service_offer');

    const acc = await call(
      'POST',
      '/v1/sessions/accept',
      {
        type: 'session_accept',
        v: 1,
        session: offer.session,
        channelRef: h.channelId,
        maxSpend: '1',
        nonce: 'http-n1',
      },
      undefined,
      auth,
    );
    expect(acc.json).toMatchObject({ status: 'active' });

    const unpaid = await call(
      'POST',
      `/v1/sessions/${offer.session}/serve`,
      { text: 'hello there' },
      undefined,
      auth,
    );
    expect(unpaid.status).toBe(402);
    expect(unpaid.json.error).toMatchObject({
      code: 'payment_required',
      requiredCumulative: '0.002',
    });
    expect(typeof unpaid.json.error.requestId).toBe('string');

    const v = h.voucher('0.002');
    const vr = await call(
      'POST',
      `/v1/sessions/${offer.session}/vouchers`,
      {
        type: 'voucher',
        v: 1,
        session: offer.session,
        ...v,
      },
      undefined,
      auth,
    );
    expect(vr.status).toBe(200);
    expect(vr.json.status).toBe('COMMITMENT_ACCEPTED_NOT_SETTLED');

    const replay = await call(
      'POST',
      `/v1/sessions/${offer.session}/vouchers`,
      {
        type: 'voucher',
        v: 1,
        session: offer.session,
        ...v,
      },
      undefined,
      auth,
    );
    expect(replay.status).toBe(409);
    expect(replay.json.error.code).toBe('replay');

    const served = await call(
      'POST',
      `/v1/sessions/${offer.session}/serve`,
      { text: 'hello there' },
      undefined,
      auth,
    );
    expect(served.json).toMatchObject({ output: 'HELLO THERE', units: 2 });

    const meter = await call(
      'POST',
      `/v1/sessions/${offer.session}/meter`,
      {
        seq: 1,
        cumulativeUnits: 2,
      },
      undefined,
      auth,
    );
    expect(meter.json).toMatchObject({ match: true });

    const usage = await call(
      'GET',
      `/v1/sessions/${offer.session}/usage`,
      undefined,
      undefined,
      auth,
    );
    expect(usage.json).toMatchObject({ units: 2, owed: '0.002', settlement: 'NOT_SETTLED' });

    const settle = await call(
      'POST',
      `/v1/channels/${h.channelId}/settle`,
      undefined,
      undefined,
      admin,
    );
    expect(settle.status).toBe(202);
    expect(settle.json).toMatchObject({ kind: 'settle', state: 'SUBMITTED', amount: '0.002' });
    expect(settle.json.state).not.toBe('CONFIRMED');
    const status = async () =>
      (await call('GET', `/v1/channels/${h.channelId}/status`, undefined, undefined, admin)).json;
    expect(await status()).toMatchObject({
      onChainStatus: 'open',
      withdrawn: '0.002',
      settlement: { kind: 'settle', state: 'SUBMITTED' },
    });

    // A second session reuses the channel with a v2 accept carrying the baseline.
    const o2 = await call('POST', '/v1/sessions/offer', { schemaVersion: 1 });
    const auth2 = { authorization: `Bearer ${o2.headers.get('x-sideband-session-token')}` };
    await call('POST', `/v1/sessions/${offer.session}/close`, {}, undefined, auth);
    const v1Reuse = await call(
      'POST',
      '/v1/sessions/accept',
      {
        type: 'session_accept',
        v: 1,
        session: o2.json.session,
        channelRef: h.channelId,
        maxSpend: '1',
        nonce: 'http-n2',
      },
      undefined,
      auth2,
    );
    expect(v1Reuse.status).toBe(409);
    expect(v1Reuse.json.error).toMatchObject({
      code: 'baseline_mismatch',
      expectedBaseline: '0.002',
    });
    const acc2 = await call(
      'POST',
      '/v1/sessions/accept',
      {
        type: 'session_accept',
        v: 2,
        session: o2.json.session,
        channelRef: h.channelId,
        maxSpend: '1',
        nonce: 'http-n3',
        baseline: '0.002',
      },
      undefined,
      auth2,
    );
    expect(acc2.json).toMatchObject({ status: 'active' });

    const close = await call(
      'POST',
      `/v1/channels/${h.channelId}/settle`,
      { mode: 'close' },
      undefined,
      admin,
    );
    expect(close.json).toMatchObject({ kind: 'close', state: 'SUBMITTED', amount: '0.002' });
    expect(await status()).toMatchObject({
      onChainStatus: 'closed',
      settlement: { kind: 'close', state: 'SUBMITTED' },
    });
    const badMode = await call(
      'POST',
      `/v1/channels/${h.channelId}/settle`,
      { mode: 'yolo' },
      undefined,
      admin,
    );
    expect(badMode.status).toBe(400);
  });

  it('validates v1/v2 accept shapes (baseline only in v2)', async () => {
    const { h, call } = await start();
    const o = await call('POST', '/v1/sessions/offer', { schemaVersion: 1 });
    const auth = { authorization: `Bearer ${o.headers.get('x-sideband-session-token')}` };
    const base = {
      type: 'session_accept',
      session: o.json.session,
      channelRef: h.channelId,
      maxSpend: '1',
      nonce: 'shape-n',
    };
    for (const body of [
      { ...base, v: 1, baseline: '0' },
      { ...base, v: 2 },
      { ...base, v: 3, baseline: '0' },
      { ...base, v: 2, baseline: 'x' },
    ]) {
      expect((await call('POST', '/v1/sessions/accept', body, undefined, auth)).status).toBe(400);
    }
    const ok = await call(
      'POST',
      '/v1/sessions/accept',
      { ...base, v: 2, baseline: '0' },
      undefined,
      auth,
    );
    expect(ok.json).toMatchObject({ status: 'active' });
  });

  it('returns the documented error schema for bad input', async () => {
    const { call } = await start();
    const bad = await call('POST', '/v1/sessions/accept', { type: 'session_accept' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatchObject({ code: 'invalid_request' });
    const malformed = await call('POST', '/v1/sessions/offer', undefined, '{nope');
    expect(malformed.status).toBe(400);
    const unknown = await call('GET', '/v1/sessions/ghost/usage', undefined, undefined, {
      authorization: `Bearer ${sessionToken(SECRET, 'ghost')}`,
    });
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

  it('rejects session endpoints without a valid token and tokens of other sessions', async () => {
    const { call } = await start();
    const a = await call('POST', '/v1/sessions/offer', { schemaVersion: 1 });
    const b = await call('POST', '/v1/sessions/offer', { schemaVersion: 1 });
    const tokA = a.headers.get('x-sideband-session-token')!;
    const path = `/v1/sessions/${b.json.session}/usage`;
    expect((await call('GET', path)).status).toBe(401);
    expect(
      (await call('GET', path, undefined, undefined, { authorization: 'Bearer nope-nope-nope' }))
        .status,
    ).toBe(401);
    expect(
      (await call('GET', path, undefined, undefined, { authorization: `Bearer ${tokA}` })).status,
    ).toBe(401); // other session's token
    const ok = await call('GET', path, undefined, undefined, {
      authorization: `Bearer ${b.headers.get('x-sideband-session-token')}`,
    });
    expect(ok.status).toBe(200);
    const acc = await call('POST', '/v1/sessions/accept', {
      type: 'session_accept',
      v: 1,
      session: b.json.session,
      channelRef: 'C',
      maxSpend: '1',
      nonce: 'n',
    });
    expect(acc.status).toBe(401);
  });

  it('admin endpoints need the admin token and are disabled when none is configured', async () => {
    const { h, call } = await start();
    const path = `/v1/channels/${h.channelId}/status`;
    expect((await call('GET', path)).status).toBe(401);
    expect(
      (await call('GET', path, undefined, undefined, { 'x-admin-token': 'wrong' })).status,
    ).toBe(401);
    expect((await call('GET', path, undefined, undefined, { 'x-admin-token': ADMIN })).status).toBe(
      200,
    );
    await new Promise<void>((r) => server!.close(() => r()));
    const off = await start(h, { adminToken: undefined as unknown as string });
    const r = await off.call('GET', path, undefined, undefined, { 'x-admin-token': ADMIN });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('forbidden');
  });

  it('rate limits per client with 429 and Retry-After, then recovers', async () => {
    let t = 0;
    const limiter = new RateLimiter(3, 1, () => t);
    const { call } = await start(undefined, { limiter });
    for (let i = 0; i < 3; i++) expect((await call('GET', '/v1/health')).status).toBe(200);
    const blocked = await call('GET', '/v1/health');
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('rate_limited');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    t += 2000;
    expect((await call('GET', '/v1/health')).status).toBe(200);
  });

  it('refuses to start with a weak session secret', () => {
    expect(() =>
      createHttpServer(undefined as never, { sessionSecret: Buffer.from('short') }),
    ).toThrow(/16 bytes/);
  });
});
