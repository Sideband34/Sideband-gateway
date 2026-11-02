import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTranscript } from '../scripts/gen-fixtures.js';
import { verifyManifest } from '../src/auth/manifest.js';

describe('session transcript fixture', () => {
  const committed = JSON.parse(readFileSync('fixtures/session-transcript.json', 'utf8'));
  it('matches regenerated output (schema drift guard)', async () => {
    expect(committed).toEqual(JSON.parse(JSON.stringify(await buildTranscript())));
  });
  it('manifest in the fixture verifies', () => {
    expect(
      verifyManifest(committed.manifest, {
        now: committed.now,
        expectedNetwork: 'testnet',
        trustedProviderKeys: new Set([committed.providerPublicKey]),
      }),
    ).toEqual({ ok: true });
  });
  it('frames use protocol v1 field names', () => {
    for (const f of Object.values(committed.frames) as Record<string, unknown>[]) {
      expect(f.v).toBe(1);
      expect(typeof f.type).toBe('string');
      expect(typeof f.session).toBe('string');
    }
  });
});
