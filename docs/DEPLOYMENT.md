# Sideband — Environment, Deployment and Recovery

## Environment boundaries
- Local: deterministic Docker Compose services, Stellar local network/Testnet, synthetic users/fixtures.
- Staging: separate database, bucket, API credentials, signing identities, Testnet assets/contracts, observability.
- Production: requires security audit, real issuer/provider agreements and relevant jurisdictional legal/compliance review. Not included in preimplementation scaffold.

## Suggested variables (non-secret examples only)
```dotenv
APP_ENV=development
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
DATABASE_URL=postgresql://localhost:5432/sideband
REDIS_URL=redis://localhost:6379
API_BASE_URL=http://localhost:3001
CHAIN_START_LEDGER=0
LOG_LEVEL=info
```
- Credentials to sign on-chain go into a secure secret manager or hardware-backed user wallet, never into a public mobile/web bundle.
- Signed store badge links are configured after actual publication; no fabricated App Store or Google Play app URLs.

## CI & GitHub setup
- GitHub Actions per repo: formatting/lint, schema checks, unit tests, dependency scanning; chain/devices smoke tests where supported.
- Branch protection and PR review recommended.
- Release tag points to tested sibling versions in an integration lockfile.
- All paths use offline/synthetic test fixtures, not real user financial records.

## Failure recovery
- Rebuild indexers from ledger cursor; compare DB projection vs chain truth.
- Restore DB backups after verifying transaction-intent reconciliation.
- Never republish user transactions solely because a client request timed out.
- Test signing-key rotation, dependency outages, stale quotes, malicious user input, insufficient balances and duplicate delivery.
- External reference infrastructure may change; check upstream project versions and licenses at build time.

## Live run against Testnet channels (2026-11-04)

Gateway: `ADAPTER=soroban`, Testnet RPC, provider `GBGVFJ3SDXJMUHW7WDZQSV6GXNU6MVY2BMTK2G6QREAZYW7OI64J75MP`, SQLite `DB_PATH`.
Driver: `scripts/testnet-session.ts` (reads the payer secret in memory from the local stellar-cli keystore; never printed or written).
Channels were created by `Sideband-channels/scripts/deploy-testnet.sh` (wasm hash `8912942ed2dcf59a71b189c3eb8377264c04f72476d148a5ed84fd62f1ec71cb`).
Raw evidence: `docs/testnet-session-*.json`. Testnet only, synthetic, not audited.

| Scenario | Channel | What happened | Tx |
|---|---|---|---|
| `settle` mode | `CDDKJTRAJW64GEABEPH6BBPMTZSC7Z3ERALFPGWGRGZ26H2DYMN2RLER` | offer, accept (channel read from Soroban), unpaid request got 402 requiring 0.002, payer-signed voucher accepted as "committed, not settled", replay refused (409), request served, admin settle CONFIRMED, channel still open, withdrawn 0.002 | [ebee4c5194…](https://stellar.expert/explorer/testnet/tx/ebee4c51945b10479c335cbe1dd92d93bcb5ad8f00db85b7dbb84114057059a0) (Horizon: successful, ledger 5558279) |
| `close` mode | `CBLNJF3LQTS2XZICOF5ELI5UXH6WBNZKRHARNWT2SHHV4SAWZWRE3YWF` | same session, then `POST /settle {"mode":"close"}` CONFIRMED; channel Closed; withdrawn 0.002 | [7cb93601ec…](https://stellar.expert/explorer/testnet/tx/7cb93601ec15dd96ef6a475f435cb5c869254d8f4964ff0f0b0b04df706080e7) (Horizon: successful, ledger 5558352) |
| `AUTO_SETTLE_AMOUNT=0.001` | `CAP3LTZDGPCDBSVHSB5EIM4NZIZXILPICYBSKRS6VSPAUIVBNOIVIKG3` | the gateway withdrew 0.002 on its own once unsettled value reached the threshold (event `Settled`, ledger 5558664), before the payer started a close (ledger 5558675) | hash not recorded |
| Payer-initiated close answered | `CA7M24HM6TGJIX36E32Q2IBSODMBORSM4GDEDVT6MWVUOGFL7KPVTH2Q` | `AUTO_SETTLE_AMOUNT=1` (unreachable, so only the close handler can act); payer `close_start` [5a47ad162f…](https://stellar.expert/explorer/testnet/tx/5a47ad162f763d9f8ad3d1d93966737def5fa1eb6d90cd2965f0a0bb5c7ce651) (ledger 5558749), then the gateway closed with the highest voucher inside the dispute window (event `Closed`, ledger 5558753); the settlement intent reached CONFIRMED | [6de34d0a04…](https://stellar.expert/explorer/testnet/tx/6de34d0a046a1dcc4dd88dff03c1b6a6759614f226d511ee227066301a55c884) (Horizon: successful) |

Dart payer vs this gateway over real HTTP with the test adapter still passes (`Sideband-mobile/test/e2e`).

### Bugs the live run found (all fixed and committed, with tests)

1. **Two SDK copies.** The gateway built its RPC server and keypair with its own `@stellar/stellar-sdk`, while the channels package used another; transactions failed to build ("functionName: expected string, Uint8Array, or XdrString"). The gateway now builds the client with `RpcSorobanClient.forUrl`, and the adapter re-creates foreign keypairs.
2. **60 s transaction window.** On a slow link simulation outlived the window and the ledger returned `txTOO_LATE` (the gateway reported a generic `sendTransaction rejected`). Window is now 300 s, configurable.
3. **Errors were swallowed.** A 500 told the operator nothing. Unexpected errors are now logged server-side with the request id (the client still sees only "Internal error"), and the admin status shows the settlement `txHash` and `failure` reason.
4. **First start failed** when `DB_PATH` pointed into a directory that did not exist; `openDb` now creates it.
5. The startup banner said "TEST ADAPTER" even with `ADAPTER=soroban`.
6. `.env.example` named `STELLAR_RPC_URL`, which the gateway does not read; it reads `SOROBAN_RPC_URL`. Fixed and documented. Also: stellar-cli loads a `.env` from its working directory, and `SOROBAN_RPC_URL` there makes it demand `--network-passphrase`; the live script runs stellar-cli from a neutral directory.

### Settlement intents are now durable

`SettlementService` takes an `IntentStore`; `main.ts` passes a SQLite store, so a restart no longer forgets an in-flight or
confirmed settlement. Covered by unit tests across a simulated restart (bigint amounts preserved, latest-intent ordering,
a rebuilt service sees the stored intent). It was **not** re-verified live after killing and restarting the real gateway.

### Not covered

- BLE and phone sessions (see the owner checklist). Only native-asset channels were run. No audit. The provider secret lives in an
  environment variable. No load or failure-injection testing against the real network.
