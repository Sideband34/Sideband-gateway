/**
 * Dev entrypoint. Uses the in-memory TEST channel adapter: there is no chain
 * connection, no real funds. The provider key is ephemeral and synthetic.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { InMemoryChannelAdapter, NETWORK_PASSPHRASES } from '@sideband/channels';
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
const kp = Keypair.random(); // ephemeral synthetic provider key
const db = openDb(config.dbPath);
const vouchers = new SqliteVoucherStore(db);
const adapter = new InMemoryChannelAdapter(now);
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
if (process.env.DEV_PAYER_PUBLIC_KEY) {
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
const server = createHttpServer(gateway);
server.listen(config.port, config.host, () => {
  console.log(
    `sideband-gateway (TEST ADAPTER, ${config.network}) on ${config.host}:${config.port}`,
  );
  console.log(`provider public key: ${kp.publicKey()}`);
});

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
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
