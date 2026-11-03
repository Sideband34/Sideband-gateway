# Contributor issues — Sideband-gateway

Scoped work for **Sideband-gateway**, taken from the gaps listed in the README status table. These are
candidates, not yet all opened on GitHub; a maintainer opens an issue (labels: `good first issue`,
`bug`, `documentation`, `stellar`, `blocked`) once its dependencies are ready. Each item names its
interface touchpoints, acceptance tests and non-goals. Size: S (< 1 day), M (1–3 days), L (> 3 days).

Rules: Testnet/synthetic only; no real keys or funds; tests for failure paths; one repository
boundary per issue. Cross-repo work is listed at the end and needs a linked PR in each repo.

## Open work

- [ ] **Wire `ADAPTER=soroban` end to end on Testnet.** *Acceptance:* `settle` and `close`
  intents reach `CONFIRMED` only with finality evidence from Testnet; `docs/DEPLOYMENT.md`
  explains setup. *Blocked on:* channels Testnet deploy. *Size:* M. Label: `stellar`.
- [ ] **Watch for payer `close_start` via events.** `settleDue` polls bindings; subscribe to the
  contract's `close_started` events instead. *Acceptance:* a fake event source triggers a
  `close` intent within one interval. *Size:* M.
- [ ] **Durable settlement intents.** Intents live in memory; persist them in SQLite like vouchers.
  *Acceptance:* a restart in `RECONCILING` resumes reconciliation by hash. *Size:* M.
- [ ] **Metrics.** Counters for vouchers accepted/rejected by reason, 402s and settlement states.
  *Acceptance:* no secrets in labels; tests for counters. *Size:* S. `good first issue`.
- [ ] **Shared rate limiting** across instances. *Acceptance:* contract tests run against
  in-memory and SQLite implementations. *Size:* M.
- [ ] **Landing: device matrix from data.** Drive `/devices` from a JSON file updated only by
  on-device test results. *Acceptance:* tests still forbid "Supported" without evidence. *Size:* S.

## Cross-repository

- [ ] **Integration lockfile.** A file in each repo pinning the tested sibling tags/SHAs, checked in
  CI. *Acceptance:* CI fails when a pinned sibling fixture differs. *Size:* M.
- [ ] **Testnet end-to-end demo.** Fund → offline session (two sessions on one channel) → settle on
  Testnet with recorded transaction hashes, driven from a clean checkout. *Blocked on:* running
  `scripts/deploy-testnet.sh` in Sideband-channels, gateway Soroban wiring. *Size:* L.
- [ ] **Physical-device compatibility harness.** Two-phone BLE run of the mobile `BleTransport`
  with a published matrix. *Acceptance:* a frame exchange of 10+ vouchers recorded per device
  pair; no row marked supported without a run. *Size:* L.
