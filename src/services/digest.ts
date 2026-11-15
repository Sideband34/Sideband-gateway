import { createHash } from 'node:crypto';
import { InvalidServiceInputError, type MeteredService, type ServiceRequest } from './types.js';

/**
 * Second metered demo service: computes a SHA-256 hex digest over UTF-8 text.
 * Billed per kilobyte (1024 UTF-8 bytes, rounded up).
 * Synthetic: proves the gateway metering abstraction across distinct units.
 */
export const BYTES_PER_KB = 1024;
export const MAX_DIGEST_BYTES = 8 * BYTES_PER_KB;

export function countKilobytes(text: string): number {
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength === 0 || text.trim().length === 0) return 0;
  return Math.ceil(byteLength / BYTES_PER_KB);
}

export function measureDigestKb(request: ServiceRequest): number {
  const byteLength = Buffer.byteLength(request.text, 'utf8');
  if (byteLength > MAX_DIGEST_BYTES) {
    throw new InvalidServiceInputError('input too large');
  }
  if (byteLength === 0 || request.text.trim().length === 0) {
    throw new InvalidServiceInputError('empty input');
  }
  return Math.ceil(byteLength / BYTES_PER_KB);
}

export function runDigestKb(text: string): { output: string; units: number } {
  const units = measureDigestKb({ text });
  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  return { output: `sha256:${digest}`, units };
}

export const demoDigestKbService: MeteredService = {
  id: 'demo-digest-kb',
  unit: 'kb',
  price: '0.005',
  measure: measureDigestKb,
  handle: (request) => runDigestKb(request.text),
};
