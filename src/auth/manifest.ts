import { Keypair } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../canonical.js';

/**
 * SIDEBAND TEST FORMAT: provider-signed service manifest.
 * signature = ed25519 over  "sideband/manifest/v1" 0x00 canonicalJson(manifest).
 * Test format: not audited, not an upstream standard.
 */
export const MANIFEST_DOMAIN = 'sideband/manifest/v1';

export interface ServiceManifest {
  schemaVersion: 1;
  serviceId: string;
  providerPublicKey: string;
  network: string;
  pricePerUnit: string;
  unit: string;
  currency: string;
  maxSessionUnits: number;
  issuedAt: number;
  expiresAt: number;
}

export interface SignedManifest {
  manifest: ServiceManifest;
  signature: string; // lowercase hex
}

export interface ManifestSigner {
  readonly publicKey: string;
  sign(message: Uint8Array): Uint8Array;
}

const preimage = (m: ServiceManifest) =>
  Buffer.concat([
    Buffer.from(MANIFEST_DOMAIN, 'ascii'),
    Buffer.from([0]),
    Buffer.from(canonicalJson(m)),
  ]);

export function signManifest(signer: ManifestSigner, m: ServiceManifest): SignedManifest {
  if (m.providerPublicKey !== signer.publicKey) throw new Error('Manifest key differs from signer');
  return { manifest: m, signature: Buffer.from(signer.sign(preimage(m))).toString('hex') };
}

export type ManifestFailure =
  'bad_signature' | 'stale_manifest' | 'not_yet_valid' | 'wrong_network' | 'untrusted_provider';

export interface ManifestExpectations {
  now: number;
  expectedNetwork: string;
  trustedProviderKeys: ReadonlySet<string>;
  /** Reject manifests issued longer ago than this, even if not expired. */
  maxAgeSec?: number;
}

/** Payer-side check. Reference implementation for mobile ports. */
export function verifyManifest(
  s: SignedManifest,
  e: ManifestExpectations,
): { ok: true } | { ok: false; code: ManifestFailure } {
  const m = s.manifest;
  if (!e.trustedProviderKeys.has(m.providerPublicKey))
    return { ok: false, code: 'untrusted_provider' };
  if (m.network !== e.expectedNetwork) return { ok: false, code: 'wrong_network' };
  let valid: boolean;
  try {
    valid = Keypair.fromPublicKey(m.providerPublicKey).verify(
      preimage(m),
      Buffer.from(s.signature, 'hex'),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: 'bad_signature' };
  if (m.issuedAt > e.now) return { ok: false, code: 'not_yet_valid' };
  if (m.expiresAt <= e.now) return { ok: false, code: 'stale_manifest' };
  if (e.maxAgeSec !== undefined && e.now - m.issuedAt > e.maxAgeSec) {
    return { ok: false, code: 'stale_manifest' };
  }
  return { ok: true };
}

export const manifestId = (s: SignedManifest) =>
  createHash('sha256').update(canonicalJson(s.manifest)).digest('hex');
