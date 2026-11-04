# Changelog

All notable changes to Sideband-gateway (provider runtime and landing site). Pre-release;
Testnet/synthetic only.

## [Unreleased]

### Added
- Durable settlement intents (`IntentStore`, SQLite via `DB_PATH`); `scripts/testnet-session.ts` live driver.
- Admin channel status shows the settlement `txHash` and `failure`.

### Fixed (found by the first live Testnet run, 2026-11-04)
- The Soroban client is built with `RpcSorobanClient.forUrl` (two SDK copies produced invalid transactions).
- Unexpected errors are logged server-side with the request id; `openDb` creates the database directory; banner shows the real adapter; `.env.example` uses `SOROBAN_RPC_URL`.

### Added
- Several sessions per channel: `session_accept` v2 with `baseline`, refused on mismatch
  (`baseline_mismatch` with `expectedBaseline`); per-session meter, budget and usage
  (`baseline`, `sessionCommitted`).
- Settlement `kind`: `settle` withdraws and keeps the channel open (long-running providers),
  `close` is terminal. `SETTLE_MODE`, `POST /v1/channels/:id/settle {mode}`, `settleDue` and
  `AUTO_SETTLE_AMOUNT` / `AUTO_SETTLE_INTERVAL_SEC`, which also answer a payer `close_start`
  with the highest voucher inside the dispute window.
- Channel status reports `deposit`, `withdrawn`, `unsettled`, `closeEffectiveAt`.
- Landing: animated three-phase storyboard, interactive spend-cap / voucher explainer,
  illustrated example use cases, contract lifecycle walkthrough; reduced-motion safe.
- Landing: "Download for Android" links straight to
  `releases/latest/download/sideband-android.apk`, with All releases, SHA-256 and install help.

### Changed
- 402 `requiredCumulative` / `currentCumulative` are channel-cumulative (baseline included);
  `sessionOwed` added.
- New channels on a `closing` channel are refused (`channel_closing`); `channel_used` removed.
- Landing screenshots retaken from the production build.

## [0.1.0]
- v1 HTTP API, signed manifest, durable SQLite stores, anti-replay voucher acceptance,
  settlement intents with reconciliation, landing site.
