import { NETWORK_PASSPHRASES, parseAmount } from '@sideband/channels';

export interface GatewayConfig {
  /** Network NAME used on the wire ("testnet"). Public network is refused. */
  network: 'testnet' | 'standalone' | 'sandbox' | 'futurenet';
  host: string;
  port: number;
  /** SQLite path, or ":memory:". */
  dbPath: string;
  serviceId: string;
  currency: string;
  unit: string;
  pricePerUnitStroops: bigint;
  maxSessionUnits: number;
  offerTtlSec: number;
  manifestTtlSec: number;
  /** Unpaid value (stroops) the provider tolerates beyond the highest voucher. */
  creditAllowanceStroops: bigint;
  rateLimitBurst: number;
  rateLimitPerSec: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const NETWORKS = ['testnet', 'standalone', 'sandbox', 'futurenet'] as const;

export function loadConfig(env: Record<string, string | undefined>): GatewayConfig {
  const network = env.STELLAR_NETWORK ?? 'testnet';
  if (network === 'public' || network === 'mainnet') {
    throw new ConfigError('Mainnet is forbidden: Testnet/synthetic only');
  }
  if (!(NETWORKS as readonly string[]).includes(network)) {
    throw new ConfigError(`Unknown STELLAR_NETWORK: ${network}`);
  }
  const int = (k: string, d: number) => {
    const v = env[k];
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new ConfigError(`${k} must be a non-negative integer`);
    return n;
  };
  const amt = (k: string, d: string) => {
    try {
      return parseAmount(env[k] ?? d);
    } catch {
      throw new ConfigError(`${k} is not a valid amount`);
    }
  };
  const price = amt('PRICE_PER_UNIT', '0.001');
  if (price <= 0n) throw new ConfigError('PRICE_PER_UNIT must be positive');
  const net = network as GatewayConfig['network'];
  void NETWORK_PASSPHRASES[net];
  return {
    network: net,
    host: env.HOST ?? '127.0.0.1',
    port: int('PORT', 3001),
    dbPath: env.DB_PATH ?? ':memory:',
    serviceId: env.SERVICE_ID ?? 'demo-text-words',
    currency: env.CURRENCY ?? 'TEST-TOKEN',
    unit: env.UNIT ?? 'word',
    pricePerUnitStroops: price,
    maxSessionUnits: int('MAX_SESSION_UNITS', 1000),
    offerTtlSec: int('OFFER_TTL_SEC', 300),
    manifestTtlSec: int('MANIFEST_TTL_SEC', 3600),
    creditAllowanceStroops: amt('CREDIT_ALLOWANCE', '0'),
    rateLimitBurst: int('RATE_LIMIT_BURST', 60),
    rateLimitPerSec: int('RATE_LIMIT_PER_SEC', 20),
  };
}
