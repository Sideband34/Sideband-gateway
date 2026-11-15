import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@sideband/channels';
import { buildTranscript } from '../scripts/gen-fixtures.js';
import { ConfigError, loadConfig } from '../src/config.js';
import { GatewayError } from '../src/errors.js';
import { createHttpServer } from '../src/http/server.js';
import { demoTextWordsService, MAX_INPUT_CHARS } from '../src/services/demo.js';
import { BYTES_PER_KB, demoDigestKbService, MAX_DIGEST_BYTES } from '../src/services/digest.js';
import { InvalidServiceInputError, type MeteredService } from '../src/services/types.js';
import { activeSession, harness } from './helpers.js';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

interface ServiceCase {
  readonly service: MeteredService;
  readonly sampleInput: string;
  readonly expectedUnits: number;
  readonly expectedOutputPattern: RegExp;
  readonly oversizeInput: string;
}

const SERVICE_CASES: readonly ServiceCase[] = [
  {
    service: demoTextWordsService,
    sampleInput: 'alpha beta gamma',
    expectedUnits: 3,
    expectedOutputPattern: /^ALPHA BETA GAMMA$/,
    oversizeInput: 'x'.repeat(MAX_INPUT_CHARS + 1),
  },
  {
    service: demoDigestKbService,
    sampleInput: 'a'.repeat(BYTES_PER_KB + 100), // 1124 bytes => 2 kb
    expectedUnits: 2,
    expectedOutputPattern: /^sha256:[0-9a-f]{64}$/,
    oversizeInput: 'y'.repeat(MAX_DIGEST_BYTES + 1),
  },
];

describe.each(SERVICE_CASES)(
  'shared metering contract for $service.id ($service.unit)',
  ({ service, sampleInput, expectedUnits, expectedOutputPattern, oversizeInput }) => {
    it('reflects the selected service in manifest, offer, 402 response, and metered execution', async () => {
      const h = await harness({ env: { SERVICE_ID: service.id } });

      const signed = h.gw.manifest();
      expect(signed.manifest).toMatchObject({
        serviceId: service.id,
        unit: service.unit,
        pricePerUnit: service.price,
      });

      const offer = h.gw.createOffer();
      expect(offer).toMatchObject({
        serviceId: service.id,
        unit: service.unit,
        pricePerUnit: service.price,
      });

      await h.gw.acceptSession({
        session: offer.session,
        channelRef: h.channelId,
        maxSpend: parseAmount('1'),
        nonce: h.nonce(),
      });

      const expectedCost = formatAmount(parseAmount(service.price) * BigInt(expectedUnits));

      const unpaid = await h.gw.serve(offer.session, sampleInput).catch((e: unknown) => e);
      expect(unpaid).toBeInstanceOf(GatewayError);
      expect(unpaid).toMatchObject({
        code: 'payment_required',
        extra: {
          serviceId: service.id,
          unit: service.unit,
          pricePerUnit: service.price,
          requiredUnits: expectedUnits,
          requiredCumulative: expectedCost,
          currentCumulative: '0',
          sessionOwed: expectedCost,
        },
      });

      await h.gw.submitVoucher(offer.session, h.voucher(expectedCost));
      const served = await h.gw.serve(offer.session, sampleInput);
      expect(served.output).toMatch(expectedOutputPattern);
      expect(served.units).toBe(expectedUnits);
      expect(served.cumulativeUnits).toBe(expectedUnits);
      expect(served.owed).toBe(expectedCost);

      expect(
        h.gw.reportMeter(offer.session, { seq: 1, cumulativeUnits: expectedUnits }),
      ).toMatchObject({
        match: true,
        discrepancyUnits: 0,
      });
    });

    it('enforces empty-input, oversize-input, and session unit-cap bounds identically', async () => {
      const h = await harness({
        env: { SERVICE_ID: service.id, MAX_SESSION_UNITS: String(expectedUnits) },
      });
      const sessionCap = formatAmount(parseAmount(service.price) * BigInt(expectedUnits));
      const id = await activeSession(h, sessionCap);

      await h.gw.submitVoucher(id, h.voucher(sessionCap));

      await expect(h.gw.serve(id, '   ')).rejects.toMatchObject({ code: 'invalid_request' });
      await expect(h.gw.serve(id, oversizeInput)).rejects.toMatchObject({
        code: 'invalid_request',
      });

      await h.gw.serve(id, sampleInput);
      await expect(h.gw.serve(id, sampleInput)).rejects.toMatchObject({ code: 'unit_cap' });
    });

    it('serves 402 and 200 over HTTP with the selected service metadata', async () => {
      const secret = Buffer.from('test-session-secret-0123456789ab');
      const h = await harness({ env: { SERVICE_ID: service.id } });
      server = createHttpServer(h.gw, { sessionSecret: secret });
      await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      const manifestRes = await fetch(`${base}/.well-known/sideband-service.json`);
      const manifestJson = (await manifestRes.json()) as {
        manifest: { serviceId: string; unit: string; pricePerUnit: string };
      };
      expect(manifestJson.manifest).toMatchObject({
        serviceId: service.id,
        unit: service.unit,
        pricePerUnit: service.price,
      });

      const offerRes = await fetch(`${base}/v1/sessions/offer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1 }),
      });
      const token = offerRes.headers.get('x-sideband-session-token')!;
      const offerJson = (await offerRes.json()) as { session: string };
      const auth = {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      };

      await fetch(`${base}/v1/sessions/accept`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          type: 'session_accept',
          v: 1,
          session: offerJson.session,
          channelRef: h.channelId,
          maxSpend: '1',
          nonce: h.nonce(),
        }),
      });

      const expectedCost = formatAmount(parseAmount(service.price) * BigInt(expectedUnits));
      const r402 = await fetch(`${base}/v1/sessions/${offerJson.session}/serve`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: sampleInput }),
      });
      expect(r402.status).toBe(402);
      const j402 = (await r402.json()) as { error: Record<string, unknown> };
      expect(j402.error).toMatchObject({
        code: 'payment_required',
        serviceId: service.id,
        unit: service.unit,
        pricePerUnit: service.price,
        requiredCumulative: expectedCost,
      });

      const v = h.voucher(expectedCost);
      await fetch(`${base}/v1/sessions/${offerJson.session}/vouchers`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ type: 'voucher', v: 1, session: offerJson.session, ...v }),
      });

      const r200 = await fetch(`${base}/v1/sessions/${offerJson.session}/serve`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: sampleInput }),
      });
      expect(r200.status).toBe(200);
      const j200 = (await r200.json()) as { output: string; units: number; owed: string };
      expect(j200.output).toMatch(expectedOutputPattern);
      expect(j200.units).toBe(expectedUnits);
      expect(j200.owed).toBe(expectedCost);
    });
  },
);

describe('service selection and fixture stability', () => {
  it('keeps the default service manifest and session-transcript fixture byte-identical', async () => {
    const committed = readFileSync('fixtures/session-transcript.json', 'utf8');
    const generated = JSON.stringify(await buildTranscript(), null, 2) + '\n';
    expect(generated).toBe(committed);
  });

  it('rejects an unknown SERVICE_ID in loadConfig', () => {
    expect(() => loadConfig({ SERVICE_ID: 'non-existent-service' })).toThrow(ConfigError);
  });

  it('supports a custom MeteredService implementing only id, unit, price, and handle', async () => {
    const perRequestEcho: MeteredService = {
      id: 'demo-echo-request',
      unit: 'request',
      price: '0.002',
      handle: ({ text }) => {
        if (!text.trim()) throw new InvalidServiceInputError('empty input');
        return { output: `echo:${text}`, units: 1 };
      },
    };
    const h = await harness({ service: perRequestEcho });
    expect(h.gw.manifest().manifest).toMatchObject({
      serviceId: 'demo-echo-request',
      unit: 'request',
      pricePerUnit: '0.002',
    });
    const id = await activeSession(h, '1');
    await expect(h.gw.serve(id, 'ping')).rejects.toMatchObject({
      code: 'payment_required',
      extra: { serviceId: 'demo-echo-request', unit: 'request', requiredCumulative: '0.002' },
    });
    await h.gw.submitVoucher(id, h.voucher('0.002'));
    expect(await h.gw.serve(id, 'ping')).toMatchObject({
      output: 'echo:ping',
      units: 1,
      owed: '0.002',
    });
  });
});
