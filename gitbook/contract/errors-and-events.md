# Errors and events

## Error codes

The contract returns `Error` as a `u32`. The Stellar CLI shows it as `Error(Contract, #N)`.

| Code | Name | Raised by | Meaning |
| --- | --- | --- | --- |
| 1 | `AlreadyInitialized` | `init` | A channel already exists on this instance. |
| 2 | `NotInitialized` | all but `init` | No channel yet. |
| 3 | `InvalidParams` | `init`, `top_up` | Bad deposit, expiry, `close_wait` window, equal payer and provider, or a non-positive amount. |
| 4 | `NotOpen` | `top_up`, `settle`, `close`, `close_start`, `refund` | The channel is terminal (`Closed` or `Refunded`), or not `Open` for a top-up. |
| 5 | `OverDeposit` | `settle`, `close` | The voucher amount is above the total deposit. |
| 6 | `NotExpired` | `refund` | The dispute window or the channel expiry has not elapsed. |
| 7 | `StaleVoucher` | `settle`, `close` | The amount is not above what was already withdrawn (or, for `close`, is below it). |
| 8 | `NotClosing` | `refund` | `refund` before `close_start`. |
| 9 | `Overflow` | arithmetic | A checked operation overflowed. |
| 10 | `AlreadyClosing` | `close_start` | `close_start` was already called. |

An invalid voucher **signature** is not one of these. `ed25519_verify` traps the invocation with a crypto host error (`Error(Crypto, …)`). The TypeScript SDK maps that to `invalid_voucher`.

### How the SDK maps them

`mapContractError` in `src/channels/soroban.ts` turns a contract code into a `ChannelError` with a code:

| Contract code | `ChannelError.code` |
| --- | --- |
| 1, 3, 9 | `invalid_params` |
| 2 | `not_found` |
| 4 | `already_settled` |
| 5 | `invalid_voucher` |
| 6 | `not_expired` |
| 7 | `stale_voucher` |
| 8 | `not_closing` |
| 10 | `already_closing` |
| `Error(Crypto, …)` | `invalid_voucher` |
| anything else | `invalid_params` |

## Events

Events are part of the contract's interface. Indexers and SDKs read them. Topics are the fields marked topic.

| Event | Topics | Data | Emitted by |
| --- | --- | --- | --- |
| `Opened` | `payer`, `provider` | `deposit`, `expires_at`, `close_wait` | `init` |
| `ToppedUp` | `payer` | `amount`, `deposit` (total after) | `top_up` |
| `Settled` | `provider` | `amount` (paid by this call), `paid_to_provider` (cumulative) | `settle` |
| `CloseStarted` | `payer` | `close_effective_at` | `close_start` |
| `Closed` | `provider` | `paid_to_provider`, `refunded_to_payer` | `close` |
| `Refunded` | `payer` | `refunded_to_payer`, `paid_to_provider` | `refund` |

A watcher can rebuild the channel's history from these six events. The `Closed` and `Refunded` events carry the final split.
