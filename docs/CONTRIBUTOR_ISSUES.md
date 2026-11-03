# Contributor issues — Sideband-gateway

Scoped work for **Sideband-gateway**, taken from the gaps listed in the README status table. These are
candidates, not yet all opened on GitHub; a maintainer opens an issue (labels: `good first issue`,
`bug`, `documentation`, `stellar`, `blocked`) once its dependencies are ready. Each item names its
interface touchpoints, acceptance tests and non-goals. Size: S (< 1 day), M (1–3 days), L (> 3 days).

Rules: Testnet/synthetic only; no real keys or funds; tests for failure paths; one repository
boundary per issue. Cross-repo work is listed at the end and needs a linked PR in each repo.

## Open work

- [ ] **Wire `ADAPTER=soroban` end to end on Testnet.** *Acceptance:* a settlement reaches
  `CONFIRMED` only with finality evidence from Testnet; `docs/DEPLOYMENT.md` explains setup.
  *Blocked on:* channels Testnet deploy. *Size:* M. Label: `stellar`.
- [ ] **Metrics and health detail.** Prometheus-style counters for vouchers accepted/rejected by
  reason, 402s, settlement states. *Acceptance:* no secrets or keys in labels; tests for counters.
  *Size:* S. `good first issue`.
- [ ] **Shared rate limiting.** Pluggable store so limits hold across instances. *Acceptance:*
  contract tests run against in-memory and SQLite implementations. *Size:* M.
- [ ] **Admin token rotation.** Accept a current and a next token during rotation. *Size:* S.
- [ ] **Landing: device matrix from data.** Drive `/devices` from a checked-in JSON file updated
  only by on-device test results. *Acceptance:* tests still forbid "Supported" without evidence.
  *Size:* S. `good first issue`.

## Cross-repository

- [ ] **Integration lockfile.** A file in each repo pinning the tested sibling tags/SHAs, checked in
  CI. *Acceptance:* CI fails when a pinned sibling fixture differs. *Size:* M.
- [ ] **Testnet end-to-end demo.** Fund → offline session → settle on Testnet with recorded
  transaction hashes, driven from a clean checkout. *Blocked on:* channels Testnet deploy, gateway
  Soroban wiring. *Size:* L.
- [ ] **Physical-device compatibility harness.** Two-phone BLE/Wi-Fi run with a published matrix.
  *Blocked on:* protocol transport adapters. *Size:* L.
