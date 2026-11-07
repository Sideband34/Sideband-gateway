# Contract overview

The channel contract is a small Soroban contract in `contracts/channel` of [Sideband-channels](https://github.com/Sideband34/Sideband-channels). It is a reference implementation of a one-way payment channel. It is **experimental and not audited**.

## Shape

| Item | Value |
| --- | --- |
| Crate | `sideband-channel` 0.1.0, MIT |
| Rust edition | 2021 |
| Soroban SDK | `soroban-sdk` 29.0.1 |
| Target | `wasm32v1-none`, release profile `opt-level = "z"`, `overflow-checks = true`, `panic = "abort"`, LTO |
| Entry points | `init`, `top_up`, `settle`, `close`, `close_start`, `refund`, `get`, `balance`, `status`, `prepare_commitment` |
| Tests | 22 unit tests plus a property test of money conservation. `cargo test` ran 23 tests, all passing. |

## One contract, one channel

Each channel is its own contract instance. You upload the wasm once, deploy an instance, then call `init` on it. `init` fails with `AlreadyInitialized` on a second call. The instance stores one `Channel` record.

## The `Channel` record

| Field | Type | Meaning |
| --- | --- | --- |
| `token` | `Address` | The asset contract the channel holds. |
| `payer` | `Address` | The payer's account. Authorises `top_up`, `close_start`, `refund`. |
| `provider` | `Address` | The provider's account. Authorises `settle`, `close`. |
| `payer_key` | `BytesN<32>` | Raw ed25519 public key that signs vouchers. It may differ from the payer's account. |
| `deposit` | `i128` | Total ever deposited (initial deposit plus top-ups). |
| `expires_at` | `u64` | Earliest time a payer-initiated close can complete (unix seconds). |
| `close_wait` | `u64` | Dispute window in seconds. |
| `close_effective_at` | `u64` | When `refund` becomes possible. `0` unless `Closing`. |
| `status` | `Status` | `Open`, `Closing`, `Closed` or `Refunded`. |
| `paid_to_provider` | `i128` | Cumulative amount withdrawn by the provider. |
| `refunded_to_payer` | `i128` | Amount returned to the payer. |

## Constants

| Constant | Value | Why |
| --- | --- | --- |
| `MIN_CLOSE_WAIT` | 60 s | Short enough for tests and demos. Real deployments should choose hours. |
| `MAX_CLOSE_WAIT` | 2,678,400 s (31 days) | Upper bound for the dispute window. |
| TTL threshold | 120,960 ledgers (about 7 days) | Extend when the instance TTL falls below this. |
| TTL extend-to | 518,400 ledgers (about 30 days) | New TTL after every write. |

## Security properties the code enforces

- Every state-changing function calls `require_auth` on the right account before it moves money.
- Arithmetic is checked. Overflow returns `Overflow` instead of wrapping, and release builds keep overflow checks on.
- A voucher can only raise `paid_to_provider`. A lower or equal one is `StaleVoucher`. One above the deposit is `OverDeposit`.
- An invalid voucher signature traps the whole invocation (`ed25519_verify` aborts), so nothing is written.
- Terminal channels reject `settle`, `close`, `top_up` and `close_start`.
- The contract moves tokens only through the token interface's `transfer`.

## What the contract does not do

- It does not know about sessions, units or prices. That is off-chain.
- It does not check that the token is a sane asset. Use a Stellar Asset Contract you trust.
- It has no admin, no pause and no upgrade path. A channel is final once deployed.
- It has not been audited.

## Build

```bash
cd contracts
SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1 \
  cargo build --release --target wasm32v1-none -p sideband-channel
cargo test
```

`stellar contract build` is the canonical build. Three build methods produced three different wasm hashes during the Testnet run, so no reproducible build is claimed. See the [deployment evidence](https://github.com/Sideband34/Sideband-channels/blob/main/docs/DEPLOYMENT.md).
