/**
 * Dev entrypoint. Uses the in-memory TEST channel adapter: there is no chain
 * connection, no real funds. The provider key is ephemeral and synthetic.
 */
import { randomBytes } from 'node:crypto';
import { RateLimiter } from './http/ratelimit.js';
import { Keypair } from '@stellar/stellar-sdk';
import {
  InMemoryChannelAdapter,
  NETWORK_PASSPHRASES,
  RpcSorobanClient,
  SorobanChannelAdapter,
} from '@sideband/channels';
import { loadConfig } from './config.js';
import { ProviderGateway } from './gateway.js';
import { createHttpServer } from './http/server.js';
import { InMemoryNonceStore } from './replay/nonces.js';
import {
  SqliteNonceStore,
  SqliteSessionStore,
  SqliteVoucherStore,
  openDb,
} from './replay/sqlite.js';
import { SettlementService } from './settlement/service.js';

const config = loadConfig(process.env);
const now = () => Math.floor(Date.now() / 1000);
// Provider key: ephemeral synthetic by default. With ADAPTER=soroban the
// provider's Testnet secret comes from PROVIDER_SECRET (env/secret manager only).
const useSoroban = process.env.ADAPTER === 'soroban';
const kp = useSoroban ? Keypair.fromSecret(need('PROVIDER_SECRET')) : Keypair.random();
const db = openDb(config.dbPath);
const vouchers = new SqliteVoucherStore(db);
function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
}
// UNVERIFIED against a live network: see README. Default is the labeled test adapter.
const adapter = useSoroban
  ? new SorobanChannelAdapter({
      // forUrl: the RPC server must come from the channels package's own SDK copy (two copies cannot share XDR objects).
      client: RpcSorobanClient.forUrl(
        need('SOROBAN_RPC_URL'),
        NETWORK_PASSPHRASES[config.network],
        kp.publicKey(),
      ),
      networkPassphrase: NETWORK_PASSPHRASES[config.network],
      wasmHash: Buffer.from(need('CHANNEL_WASM_HASH'), 'hex'),
      signers: new Map([[kp.publicKey(), kp]]),
      commitmentKeys: new Map(),
      now,
    })
  : new InMemoryChannelAdapter(now);
const gateway = new ProviderGateway({
  config,
  signer: { publicKey: kp.publicKey(), sign: (m) => kp.sign(Buffer.from(m)) },
  adapter,
  vouchers,
  nonces: config.dbPath === ':memory:' ? new InMemoryNonceStore() : new SqliteNonceStore(db),
  settlement: new SettlementService(adapter, vouchers),
  now,
  sessions: new SqliteSessionStore(db),
});
console.log('restored sessions:', await gateway.restore());
// Dev convenience: with DEV_PAYER_PUBLIC_KEY set, open ONE synthetic channel in
// the in-memory TEST adapter so a local payer can try a session. No chain.
if (process.env.DEV_PAYER_PUBLIC_KEY && !useSoroban) {
  const { binding } = await adapter.open({
    networkPassphrase: NETWORK_PASSPHRASES[config.network],
    payer: process.env.DEV_PAYER_PUBLIC_KEY,
    provider: kp.publicKey(),
    asset: config.currency,
    deposit: 10n * 10_000_000n,
    expiresAt: now() + 3600,
    idempotencyKey: 'dev-seed',
  });
  console.log(`synthetic dev channel (test adapter): ${binding.channelId}`);
}
const sessionSecret = process.env.SESSION_SECRET
  ? Buffer.from(process.env.SESSION_SECRET, 'utf8')
  : randomBytes(32); // ephemeral: session tokens stop working after restart
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET not set: using an ephemeral secret');
if (!process.env.ADMIN_TOKEN)
  console.warn('ADMIN_TOKEN not set: settle/status endpoints are disabled');
const server = createHttpServer(gateway, {
  sessionSecret,
  ...(process.env.ADMIN_TOKEN ? { adminToken: process.env.ADMIN_TOKEN } : {}),
  limiter: new RateLimiter(config.rateLimitBurst, config.rateLimitPerSec),
});
server.listen(config.port, config.host, () => {
  console.log(
    `sideband-gateway (${useSoroban ? 'SOROBAN ADAPTER' : 'TEST ADAPTER'}, ${config.network}) on ${config.host}:${config.port}`,
  );
  console.log(`provider public key: ${kp.publicKey()}`);
});

// Long-running providers: withdraw with `settle` once unsettled value reaches
// AUTO_SETTLE_AMOUNT, and answer a payer close_start with our highest voucher.
let autoSettle: NodeJS.Timeout | undefined;
if (config.autoSettleStroops > 0n) {
  let busy = false;
  autoSettle = setInterval(() => {
    if (busy) return;
    busy = true;
    gateway
      .settleDue(config.autoSettleStroops)
      .then((intents) => {
        for (const i of intents) console.log(`auto ${i.kind} ${i.channelId}: ${i.state}`);
      })
      .catch((e: unknown) => console.error('auto-settle failed:', (e as Error).message))
      .finally(() => {
        busy = false;
      });
  }, config.autoSettleIntervalSec * 1000);
  autoSettle.unref();
}

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  if (autoSettle) clearInterval(autoSettle);
  console.log(`${signal}: shutting down`);
  const intents = await gateway.shutdown();
  console.log(`prepared ${intents.length} settlement intent(s)`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
