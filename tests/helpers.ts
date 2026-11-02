import { Keypair } from '@stellar/stellar-sdk';
import {
  InMemoryChannelAdapter,
  InMemoryVoucherStore,
  NETWORK_PASSPHRASES,
  createVoucher,
  keypairSigner,
  parseAmount,
  type ChannelAdapter,
  type VoucherStore,
} from '@sideband/channels';
import { loadConfig } from '../src/config.js';
import { ProviderGateway } from '../src/gateway.js';
import { InMemoryNonceStore, type NonceStore } from '../src/replay/nonces.js';
import { SettlementService } from '../src/settlement/service.js';

/** Deterministic SYNTHETIC test keys (public test data, worthless). */
export const providerKp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 21));
export const payerKp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 22));
export const strangerKp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 23));
export const S = 10_000_000n;

export interface Harness {
  clock: { t: number };
  adapter: ChannelAdapter;
  vouchers: VoucherStore;
  nonces: NonceStore;
  settlement: SettlementService;
  gw: ProviderGateway;
  channelId: string;
  domain: { networkPassphrase: string; channelId: string; payer: string; provider: string };
  voucher(units: string): ReturnType<typeof createVoucher>;
  nonce(): string;
}

export interface HarnessOpts {
  adapter?: (now: () => number) => ChannelAdapter;
  vouchers?: VoucherStore;
  nonces?: NonceStore;
  deposit?: bigint;
  channelExpiresAt?: number;
  env?: Record<string, string>;
  allowedPayers?: Set<string>;
  channelProvider?: string;
  channelNetwork?: string;
  newId?: () => string;
}

export async function harness(o: HarnessOpts = {}): Promise<Harness> {
  const clock = { t: 1_000 };
  const now = () => clock.t;
  const adapter = o.adapter?.(now) ?? new InMemoryChannelAdapter(now);
  const vouchers = o.vouchers ?? new InMemoryVoucherStore();
  const nonces = o.nonces ?? new InMemoryNonceStore();
  const settlement = new SettlementService(adapter, vouchers);
  const config = loadConfig({ PRICE_PER_UNIT: '0.001', MAX_SESSION_UNITS: '1000', ...o.env });
  const gw = new ProviderGateway({
    config,
    signer: { publicKey: providerKp.publicKey(), sign: (m) => providerKp.sign(Buffer.from(m)) },
    adapter,
    vouchers,
    nonces,
    settlement,
    now,
    ...(o.newId ? { newId: o.newId } : {}),
    ...(o.allowedPayers ? { allowedPayers: o.allowedPayers } : {}),
  });
  const { binding } = await adapter.open({
    networkPassphrase: o.channelNetwork ?? NETWORK_PASSPHRASES.testnet,
    payer: payerKp.publicKey(),
    provider: o.channelProvider ?? providerKp.publicKey(),
    asset: 'TEST-TOKEN',
    deposit: o.deposit ?? 10n * S,
    expiresAt: o.channelExpiresAt ?? 100_000,
    idempotencyKey: `h-${Math.random()}`,
  });
  const domain = {
    networkPassphrase: binding.networkPassphrase,
    channelId: binding.channelId,
    payer: binding.payer,
    provider: binding.provider,
  };
  let n = 0;
  return {
    clock,
    adapter,
    vouchers,
    nonces,
    settlement,
    gw,
    channelId: binding.channelId,
    domain,
    voucher: (units) => createVoucher(keypairSigner(payerKp), domain, parseAmount(units)),
    nonce: () => `nonce-${Math.random()}-${n++}`,
  };
}

/** offer -> accept; returns the session id. */
export async function activeSession(h: Harness, maxSpend = '1') {
  const offer = h.gw.createOffer();
  await h.gw.acceptSession({
    session: offer.session,
    channelRef: h.channelId,
    maxSpend: parseAmount(maxSpend),
    nonce: h.nonce(),
  });
  return offer.session;
}
