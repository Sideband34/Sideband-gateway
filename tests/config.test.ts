import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { canonicalJson } from '../src/canonical.js';

describe('config', () => {
  it('defaults to testnet and refuses mainnet / unknown networks', () => {
    expect(loadConfig({}).network).toBe('testnet');
    expect(() => loadConfig({ STELLAR_NETWORK: 'public' })).toThrow(/forbidden/);
    expect(() => loadConfig({ STELLAR_NETWORK: 'mainnet' })).toThrow(/forbidden/);
    expect(() => loadConfig({ STELLAR_NETWORK: 'moon' })).toThrow(/Unknown/);
  });
  it('validates numeric and amount settings', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
    expect(() => loadConfig({ PRICE_PER_UNIT: '0' })).toThrow(/positive/);
    expect(() => loadConfig({ PRICE_PER_UNIT: '1e3' })).toThrow();
    expect(loadConfig({ PRICE_PER_UNIT: '0.5' }).pricePerUnitStroops).toBe(5_000_000n);
  });
  it('settlement mode and auto-settle', () => {
    const d = loadConfig({});
    expect(d).toMatchObject({
      settleMode: 'settle',
      autoSettleStroops: 0n,
      autoSettleIntervalSec: 60,
    });
    expect(loadConfig({ SETTLE_MODE: 'close' }).settleMode).toBe('close');
    expect(() => loadConfig({ SETTLE_MODE: 'yolo' })).toThrow(/SETTLE_MODE/);
    expect(loadConfig({ AUTO_SETTLE_AMOUNT: '0.5' }).autoSettleStroops).toBe(5_000_000n);
    expect(() => loadConfig({ AUTO_SETTLE_AMOUNT: 'x' })).toThrow();
    expect(loadConfig({ AUTO_SETTLE_INTERVAL_SEC: '0' }).autoSettleIntervalSec).toBe(1);
  });
});

describe('canonicalJson (parity with sideband-protocol Dart)', () => {
  it('sorts keys, has no whitespace, rejects floats', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } })).toBe(
      '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}',
    );
    expect(() => canonicalJson({ a: 1.5 })).toThrow();
  });
});
