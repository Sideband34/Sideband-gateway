# Deploying Sideband-gateway

The gateway is a TypeScript service (HTTP 402 flow, sessions, anti-replay voucher validation, settlement). The landing site is a Next.js app in `apps/landing`. Everything is **Testnet and synthetic only**.

## Environment boundaries

| Environment | What runs |
|---|---|
| Local | `npm start` with the default synthetic test adapter, or `ADAPTER=soroban` against Testnet |
| Hosted demo | Landing on Vercel, gateway on Render (free plan, test adapter) |
| Production | Not available. It needs an audit, a managed provider key and a legal review. |

## Environment variables

All optional unless marked. Values shown are the examples in `.env.example`.

| Variable | Example | Purpose |
|---|---|---|
| `PORT`, `HOST` | `3001`, `127.0.0.1` | Listen address. Set `HOST=0.0.0.0` on a host that routes traffic in (Render does set `PORT`) |
| `STELLAR_NETWORK` | `testnet` | `testnet`, `standalone`, `sandbox` or `futurenet`. The public network is refused |
| `ADAPTER` | unset | Unset runs the synthetic test adapter. `soroban` uses a real channel |
| `SESSION_SECRET` | random | Signs session tokens. Generate your own, 32 or more characters. **Required** |
| `ADMIN_TOKEN` | unset | Enables the settle and status endpoints. Unset disables them |
| `DB_PATH` | `:memory:` | SQLite file for vouchers, nonces, sessions and settlement intents. The directory is created |
| `SERVICE_ID`, `UNIT`, `CURRENCY` | | Manifest fields of the demo service |
| `PRICE_PER_UNIT`, `MAX_SESSION_UNITS`, `CREDIT_ALLOWANCE` | `0.001`, `1000`, `0` | Price and caps |
| `SETTLE_MODE` | `settle` | `settle` withdraws and keeps the channel open. `close` is terminal |
| `AUTO_SETTLE_AMOUNT`, `AUTO_SETTLE_INTERVAL_SEC` | `0`, `60` | Settle automatically once unsettled value reaches the amount. This also answers a payer `close_start` |
| `RATE_LIMIT_BURST`, `RATE_LIMIT_PER_SEC` | `60`, `20` | Request limiter |
| `DEV_PAYER_PUBLIC_KEY` | unset | Opens one synthetic channel in the test adapter |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Read by the live adapter. The name is not `STELLAR_RPC_URL` |
| `CHANNEL_WASM_HASH` | | Hash of the uploaded channel wasm (live adapter) |
| `PROVIDER_SECRET` | | Testnet provider secret for the live adapter. Set it only in your own host settings or an untracked `.env`. Never commit it |

## Hosted demo

| Part | Where | Notes |
|---|---|---|
| Landing | Vercel, project root `apps/landing`, https://sideband-web1.vercel.app | Optional store badge variables stay unset until a listing exists |
| Gateway | Render web service, free plan, https://sideband-gateway.onrender.com | Synthetic test adapter. Health route `/v1/health`. The signed manifest is at `/.well-known/sideband-service.json` |

Render build command. The gateway depends on the sibling package `file:../Sideband-channels`, so the build clones it, builds it, and copies the built package into `node_modules`:

```bash
git clone --depth 1 https://github.com/Sideband34/Sideband-channels ../Sideband-channels && (cd ../Sideband-channels && npm ci --include=dev) && npm ci --include=dev && rm -rf node_modules/@sideband/channels && mkdir -p node_modules/@sideband/channels && cp -r ../Sideband-channels/dist ../Sideband-channels/fixtures ../Sideband-channels/package.json node_modules/@sideband/channels/
```

Start command: `npm start`. Environment: `APP_ENV=development`, `STELLAR_NETWORK=testnet`, `HOST=0.0.0.0`, and a generated `SESSION_SECRET`.

Free-plan limits: the instance sleeps when idle (the first request after a pause can take 50 seconds or more), there is no disk (leave `DB_PATH` unset, so state is in memory and lost on restart), and the
build re-clones `Sideband-channels` from `main` each time, so an incompatible change there can break a later build. The hosted gateway does **not** run the live adapter, because that needs a provider secret key
that only the operator may set.

## Recovery

- Settlement intents are persisted in SQLite when `DB_PATH` is a file, so a restart does not forget an in-flight or confirmed settlement. This is covered by unit tests across a simulated restart, and was not re-verified by restarting the live gateway.
- Never republish a settlement because a request timed out: read the ledger first.
- Rotate `SESSION_SECRET` to invalidate all session tokens.

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
