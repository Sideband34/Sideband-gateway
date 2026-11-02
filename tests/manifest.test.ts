import { describe, expect, it } from 'vitest';
import { verifyManifest, type ManifestExpectations } from '../src/auth/manifest.js';
import { harness, providerKp, strangerKp } from './helpers.js';

describe('signed service manifest', () => {
  async function setup() {
    const h = await harness();
    const signed = h.gw.manifest();
    const exp: ManifestExpectations = {
      now: h.clock.t,
      expectedNetwork: 'testnet',
      trustedProviderKeys: new Set([providerKp.publicKey()]),
    };
    return { h, signed, exp };
  }

  it('verifies for a trusted provider on the expected network', async () => {
    const { signed, exp } = await setup();
    expect(verifyManifest(signed, exp)).toEqual({ ok: true });
    expect(signed.manifest).toMatchObject({ schemaVersion: 1, pricePerUnit: '0.001' });
  });

  it('rejects stale (expired or too-old) manifests', async () => {
    const { signed, exp } = await setup();
    expect(verifyManifest(signed, { ...exp, now: signed.manifest.expiresAt })).toEqual({
      ok: false,
      code: 'stale_manifest',
    });
    expect(
      verifyManifest(signed, { ...exp, now: signed.manifest.issuedAt + 100, maxAgeSec: 50 }),
    ).toEqual({ ok: false, code: 'stale_manifest' });
  });

  it('rejects not-yet-valid manifests', async () => {
    const { signed, exp } = await setup();
    expect(verifyManifest(signed, { ...exp, now: signed.manifest.issuedAt - 1 })).toEqual({
      ok: false,
      code: 'not_yet_valid',
    });
  });

  it('rejects wrong network, untrusted provider and tampering', async () => {
    const { signed, exp } = await setup();
    expect(verifyManifest(signed, { ...exp, expectedNetwork: 'futurenet' })).toEqual({
      ok: false,
      code: 'wrong_network',
    });
    expect(
      verifyManifest(signed, { ...exp, trustedProviderKeys: new Set([strangerKp.publicKey()]) }),
    ).toEqual({ ok: false, code: 'untrusted_provider' });
    const tampered = { ...signed, manifest: { ...signed.manifest, pricePerUnit: '0.000001' } };
    expect(verifyManifest(tampered, exp)).toEqual({ ok: false, code: 'bad_signature' });
    const badSig = { ...signed, signature: 'zz' };
    expect(verifyManifest(badSig, exp)).toEqual({ ok: false, code: 'bad_signature' });
  });
});
