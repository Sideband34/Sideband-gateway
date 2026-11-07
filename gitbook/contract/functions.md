# Contract functions

Every public function of the channel contract, with parameters, return type, who must authorise, and what can go wrong. Error codes are on [Errors and events](errors-and-events.md). The status column lists the statuses in which a call is allowed.

## Write functions

### `init`

```rust
pub fn init(env: Env, token: Address, payer: Address, provider: Address,
            payer_key: BytesN<32>, deposit: i128, expires_at: u64,
            close_wait: u64) -> Result<(), Error>
```

| Item | Value |
| --- | --- |
| Auth | `payer` |
| Allowed when | No channel exists yet |
| Effect | Moves `deposit` of `token` from `payer` into the contract. Stores the channel as `Open`. Emits `Opened`. |
| Errors | `AlreadyInitialized`. `InvalidParams` if `deposit <= 0`, `expires_at <= now`, `close_wait` outside 60..=2,678,400, or `payer == provider`. |

Real invocation from `scripts/deploy-testnet.sh` (`payer_key` is the payer's ed25519 public key as 64 hex characters):

```bash
stellar contract invoke --id "$CHANNEL_ID" --source "$PAYER" --network testnet -- \
  init --token "$TOKEN" --payer "$PAYER_ADDR" --provider "$PROVIDER_ADDR" \
  --payer_key "$PAYER_KEY_HEX" --deposit 10000000 \
  --expires_at "$EXPIRES_AT" --close_wait 600
```

### `top_up`

```rust
pub fn top_up(env: Env, amount: i128) -> Result<(), Error>
```

| Item | Value |
| --- | --- |
| Auth | `payer` |
| Allowed when | `Open` |
| Effect | Adds `amount` to `deposit`, moves the tokens in. Emits `ToppedUp`. |
| Errors | `NotInitialized`, `NotOpen` (any other status), `InvalidParams` (`amount <= 0`), `Overflow`. |

### `settle`

```rust
pub fn settle(env: Env, cumulative: i128, signature: BytesN<64>) -> Result<i128, Error>
```

| Item | Value |
| --- | --- |
| Auth | `provider` |
| Allowed when | `Open` or `Closing` |
| Effect | Verifies `signature` over the commitment for `cumulative`. Pays `cumulative - paid_to_provider` to the provider. Sets `paid_to_provider = cumulative`. The channel keeps its status. Emits `Settled`. |
| Returns | The amount paid out by this call. |
| Errors | `NotOpen` (terminal channel), `StaleVoucher` (`cumulative <= paid_to_provider`), `OverDeposit` (`cumulative > deposit`), `Overflow`. A bad signature traps. |

### `close`

```rust
pub fn close(env: Env, cumulative: i128, signature: BytesN<64>) -> Result<(), Error>
```

| Item | Value |
| --- | --- |
| Auth | `provider` |
| Allowed when | `Open` or `Closing` |
| Effect | If `cumulative > paid_to_provider`, behaves like `settle` first. Then sends the remaining balance (`deposit - paid - refunded`) to the payer. Status becomes `Closed`. Emits `Closed`. |
| Special case | Passing exactly `paid_to_provider` closes **without** a new voucher. The signature is then ignored. |
| Errors | `NotOpen`, `StaleVoucher` (`cumulative < paid_to_provider`), `OverDeposit`, `Overflow`. |

### `close_start`

```rust
pub fn close_start(env: Env) -> Result<u64, Error>
```

| Item | Value |
| --- | --- |
| Auth | `payer` |
| Allowed when | `Open` |
| Effect | Sets `close_effective_at = max(now + close_wait, expires_at)` and status `Closing`. Emits `CloseStarted`. |
| Returns | `close_effective_at`. |
| Errors | `AlreadyClosing` (already `Closing`), `NotOpen` (terminal), `Overflow`. |

### `refund`

```rust
pub fn refund(env: Env) -> Result<i128, Error>
```

| Item | Value |
| --- | --- |
| Auth | `payer` |
| Allowed when | `Closing`, at or after `close_effective_at` |
| Effect | Sends the unsettled balance to the payer. Status becomes `Refunded`. Emits `Refunded`. |
| Returns | The amount refunded. |
| Errors | `NotClosing` (called while `Open`), `NotOpen` (terminal), `NotExpired` (before `close_effective_at`), `Overflow`. |

## Read functions

| Function | Returns | Notes |
| --- | --- | --- |
| `get() -> Result<Channel, Error>` | The full `Channel` record | `NotInitialized` before `init`. |
| `balance() -> Result<i128, Error>` | `deposit - paid_to_provider - refunded_to_payer` | Funds still held for the channel. |
| `status() -> Result<Status, Error>` | `Open`, `Closing`, `Closed` or `Refunded` | |
| `prepare_commitment(amount: i128) -> Bytes` | The exact bytes a payer must sign for `amount` on this channel | Parity check for off-chain encoders. See [Commitment encoding](commitment-encoding.md). |

## Who can call what

| Function | payer | provider | anyone |
| --- | --- | --- | --- |
| `init`, `top_up`, `close_start`, `refund` | yes | no | no |
| `settle`, `close` | no | yes | no |
| `get`, `balance`, `status`, `prepare_commitment` | yes | yes | yes |

## Call order cheat sheet

```
init -> (top_up)* -> (settle)* -> close                      => Closed
init -> (top_up)* -> (settle)* -> close_start -> (settle|close)* -> refund   => Refunded
```

`close` after `close_start` is the provider's answer during the dispute window. Once `Closed` or `Refunded`, no write function succeeds.
