# Channel lifecycle

A channel is one Soroban contract instance. It stores exactly one `Channel` record and moves through four states. This page lists every state, every transition and every rule that blocks one. The source is `contracts/channel/src/lib.rs` in [Sideband-channels](https://github.com/Sideband34/Sideband-channels).

## States

| State | Meaning | Terminal |
| --- | --- | --- |
| `Open` | Funded. The provider may `settle` or `close`. The payer may `top_up` or `close_start`. | No |
| `Closing` | The payer called `close_start`. The provider may still `settle` or `close` until the dispute window ends. | No |
| `Closed` | The provider closed. It was paid up to its highest voucher and the payer got the rest. | Yes |
| `Refunded` | The payer reclaimed the unsettled balance after the dispute window. | Yes |

## Transitions

| Call | Who must authorise | From | To | Rule |
| --- | --- | --- | --- | --- |
| `init` | payer | (none) | `Open` | Fails with `AlreadyInitialized` if a channel exists. Needs `deposit > 0`, `expires_at` in the future, `close_wait` in 60..=2,678,400 and `payer != provider`. Otherwise `InvalidParams`. |
| `top_up` | payer | `Open` | `Open` | Amount must be positive. Any other status gives `NotOpen`. |
| `settle` | provider | `Open`, `Closing` | same | Pays the difference between the voucher and what was already withdrawn. Terminal status gives `NotOpen`. |
| `close` | provider | `Open`, `Closing` | `Closed` | Pays up to the voucher, refunds the remainder to the payer in the same call. |
| `close_start` | payer | `Open` | `Closing` | Sets `close_effective_at = max(now + close_wait, expires_at)`. A second call gives `AlreadyClosing`. |
| `refund` | payer | `Closing` | `Refunded` | Only at or after `close_effective_at`, otherwise `NotExpired`. Called on `Open` gives `NotClosing`. |

## The dispute window

When the payer starts closing, the provider needs time to present its highest voucher. The contract therefore delays `refund` until `close_effective_at`:

```
close_effective_at = max(now + close_wait, expires_at)
```

Both cases were run through the SDK's in-memory adapter, which implements the same formula. `close_wait` is 3600 s and the call happens at `now = 1000000`:

| `expires_at` | `now + close_wait` | `close_effective_at` | Which term wins |
| --- | --- | --- | --- |
| 1007200 | 1003600 | **1007200** | the expiry |
| 1001000 | 1003600 | **1003600** | the window |

{% hint style="info" %}
A payer cannot reclaim funds before the channel's `expires_at`, even with a short `close_wait`. The Testnet refund smoke test needed a one-hour channel expiry for this reason. See [Testnet evidence](../evidence/testnet-evidence.md).
{% endhint %}

## Money conservation

The contract keeps `paid_to_provider` (cumulative withdrawals) and `refunded_to_payer`. At every moment:

```
deposit == paid_to_provider + refunded_to_payer + balance
```

and the token balance the contract holds equals `balance`. A property test (`proptest_conservation.rs`) checks this over random sequences of calls. In the SDK worked example the final split is `0.007 + 0.993 = 1`.

## Storage

The contract uses instance storage with a single key (`Key::Channel`). Every write extends the instance TTL: when it falls below 120,960 ledgers (about 7 days at 5 s per ledger) it is extended to 518,400 ledgers (about 30 days). A channel nobody touches for a month can expire from the ledger, so a long-lived channel needs periodic activity.

## Idempotence and replay

Replays are harmless by construction:

- A voucher at or below `paid_to_provider` fails with `StaleVoucher`.
- A voucher above `deposit` fails with `OverDeposit`.
- A terminal channel rejects `settle` and `close` with `NotOpen`, so an old voucher can never pay again after `Closed`.
