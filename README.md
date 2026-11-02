<img src="./brand/icon.svg" alt="Sideband logo" width="144" />

# sideband-gateway

> Sideband — Nearby services. Metered value. Stellar settlement.

**Status: M0-M2 core implemented against a TEST channel adapter (see Status below); no Testnet integration.** This repo is one of **exactly four meaningful independent codebases** in the Sideband Stellar-native project. It is not a placeholder created merely to increase Drips Wave submissions.

## Owns
Local service hosting, provider authentication, usage meter, anti-replay voucher validation, metered-demo service, settlement preparation, product marketing web

## Why it is separate
It has a distinct runtime/toolchain, external interface, tests, release cadence and maintainership boundary. Its siblings depend on its delivered interface, but implementation responsibilities must not be duplicated.

## Sibling repositories
- `sideband-mobile` — Nearby service discovery UX, local sessions, payer/provider modes, secure signing, spending limits, usage history and receipts
- `sideband-protocol` — BLE/local-Wi-Fi discovery, pairing, authenticated session frames, transport retries, metering message schema, backpressure and session IDs
- `sideband-channels` — Stellar channel deployment/adapters, prefunding, domain-separated cumulative commitments, close/refund, on-chain settlement and contract tests

## Architecture and development context
Start with:
- `AGENTS.md` — coding agent rules;
- `docs/PRD.md` — product purpose and MVP;
- `docs/SRD.md` — user/system requirements, APIs and state;
- `docs/ARCHITECTURE.md` — four-repository responsibilities, data and execution paths;
- `docs/TECHNICAL_BUILD.md` — recommended bootstrap, testing, phases;
- `docs/SECURITY.md` — security/trust boundaries;
- `docs/BRAND.md` — approved flat logo and flexible UI direction;
- `docs/ROADMAP.md` — milestone acceptance gates.

## Technical target
TypeScript gateway + small landing site. The actual product implementation starts at milestone M0; no real-money transactions or claims exist in this scaffold.

## Minimal integration contract
Always test the dependency path stated in ARCHITECTURE.md. Every new public endpoint/ABI/package message must be versioned and covered by consumer fixtures. See `docs/SRD.md` and `docs/TECHNICAL_BUILD.md`.

## Drips Wave
Stellar is essential: An online setup transaction deposits a supported Stellar asset into a Soroban one-way payment channel bound to a provider and payer commitment key. Approval/eligibility for Wave depends on substantive open-source implementation and organizer review, not repo count.


## Official project identity

The project uses the **approved flat SVG logo** in [`brand/icon.svg`](./brand/icon.svg), with an editable transparent vector mark in [`brand/mark.svg`](./brand/mark.svg). The [512 px GitHub organization avatar](./brand/org-avatar.png) is in the same directory. This logo is shared by all four project repositories. UI design remains intentionally flexible.


## Status: provider gateway + landing (v0.1.0)

**Implemented and tested**

- `src/gateway.ts`: session offer/accept (funded-channel binding, network and provider checks, one-time nonces, per-session channel lock, spend caps), voucher acceptance via `@sideband/channels` (`acceptVoucher`: ed25519, domain separation, atomic compare-and-swap), metered demo service (per-word text upper-casing) that refuses unpaid work with HTTP 402, usage meter with payer/provider discrepancy report, graceful provider shutdown that prepares settlement for all accepted value.
- `src/replay/sqlite.ts`: durable voucher and nonce stores on `node:sqlite` (CAS is one guarded SQL statement). Survives restart in tests.
- `src/settlement`: prepares/submits settlement intents (`CREATED -> AUTHORIZED -> SUBMITTED`, `RECONCILING` after a submission timeout, `CONFIRMED` only with finality evidence for the right network). Amount locks once settlement is in flight.
- `src/auth/manifest.ts`: provider-signed service manifest and a payer-side verifier (stale, not-yet-valid, wrong network, untrusted provider, tamper). Test format.
- `src/http/server.ts`: API v1 per `docs/SRD.md` (`docs/openapi.yaml`), Zod-validated, 16 KiB body bound, documented error schema, request ids.
- `fixtures/session-transcript.json`: deterministic synthetic transcript (signed manifest + protocol v1 frames) for sibling consumer tests.
- `apps/landing`: Next.js 16 static site (overview, providers, devices, safety/FAQ) with accessible-route tests. It claims no store listing, no device support and no settlement finality.

**Verified:** `npm run check` (prettier, eslint, tsc, 47 vitest tests) and in `apps/landing`: `npm run lint && npm run typecheck && npm test && npm run build`.

**NOT done / unverified**

- All channel interaction uses `InMemoryChannelAdapter` (labeled test adapter, `synthetic: true`). There is no Soroban RPC adapter, no Testnet transaction and no reconciliation against a real ledger.
- Sessions are held in memory (vouchers and nonces are durable; session/meter state is not). No auth/RBAC on the HTTP API, no rate limiting, no TLS: local-demo only.
- Voucher and manifest layouts are Sideband test formats, not audited.
- The sibling `Dart` protocol decoding of the fixture frames is exercised in `sideband-mobile`, not here.

## Quick start

Needs the sibling repo built first (it is a `file:` dependency):

```
git clone <sideband-channels> ../Sideband-channels && (cd ../Sideband-channels && npm ci && npm run build)
npm ci
npm run check
npm run fixtures                      # regenerate fixtures/session-transcript.json
DEV_PAYER_PUBLIC_KEY=G... npm start   # local server; Ctrl-C prepares settlement and exits cleanly
cd apps/landing && npm ci && npm run build
```

## Siblings and compatibility

| Repo | Used for |
|---|---|
| `sideband-channels` v0.1.0 | voucher verification, CAS interface, channel adapter interface, settlement intents |
| `sideband-protocol` v0.1.0 | frame field names and limits (`service_offer`, `session_accept`, `voucher`, `meter_sample`) |
| `sideband-mobile` | payer client; decodes `fixtures/session-transcript.json` |
