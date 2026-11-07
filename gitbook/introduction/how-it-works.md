# How it works

This page follows one payer and one provider from deposit to refund. The numbers come from a real run of the gateway on the test adapter; its public routes are documented in the [gateway README](https://github.com/Sideband34/Sideband-gateway#quick-start). Amounts have seven decimal places, like Stellar stroops.

## Cast

| Role | What it holds | Key |
| --- | --- | --- |
| Payer | The deposit, a voucher signing key | ed25519 key. The public key is stored in the channel as `payer_key`. |
| Provider | A Stellar account that receives payouts and a service | ed25519 account key |
| Channel contract | The deposit and the rules | Contract address (`C…`) |

## Step by step

### 1. Open and fund the channel (online)

The payer calls `init` on a fresh channel contract with the token, the provider, its voucher key, a deposit, an expiry time and a dispute window `close_wait` between 60 seconds and 31 days. The contract moves the deposit in. Status is `Open`.

Example: deposit `1`, expiry two hours out, `close_wait` 3600 s.

### 2. Discover the provider (offline)

The provider publishes a signed *manifest*: service id, price per unit, unit, currency, network and an expiry. The payer verifies the signature against a provider key it already trusts.

### 3. Offer and accept (offline)

- The provider sends a `service_offer`: price `0.001` per `word`, at most 1000 words, valid for 300 s.
- The payer checks the network, currency, price cap and provider key, then sends a `session_accept`: the channel, a budget `maxSpend` of `0.5`, a one-time nonce, and a `baseline`.

The baseline is the highest amount the payer has already signed on this channel. It is `0` for a fresh channel. See [Protocol v2 baseline](../protocol/baseline-v2.md).

### 4. Use the service and pay (offline)

The payer asks for work. The provider counts units and refuses work the vouchers do not cover:

```json
{"error":{"code":"payment_required","message":"Voucher does not cover this request",
 "requiredCumulative":"0.002","currentCumulative":"0","sessionOwed":"0.002"}}
```

HTTP status `402`. The payer signs a voucher for the cumulative amount `0.002` and sends it. The gateway verifies the signature and answers `COMMITMENT_ACCEPTED_NOT_SETTLED`. The request is then served. A second word count of `0.004` needs a new voucher for `0.004`, not `0.002` again. Vouchers only go up.

### 5. Settle (online)

When the provider has connectivity it submits the highest voucher with `settle`. The contract checks the signature, pays the *difference* from what the provider already withdrew, and leaves the channel open. In the worked example the provider ends up with `0.007`.

### 6. Close or refund (online)

There are two ways out:

- **Provider close.** The provider calls `close` with its highest voucher. It is paid, the remainder goes back to the payer, the channel is `Closed`.
- **Payer refund.** If the provider disappears, the payer calls `close_start`. This opens the dispute window. The provider can still settle a higher voucher until it ends. After `max(now + close_wait, expires_at)` the payer calls `refund` and gets the unsettled balance back. Status is `Refunded`.

In the worked example the payer gets back `0.993` and the provider keeps `0.007`. They add up to the deposit of `1`.

## One diagram

```
 payer                       provider                    channel contract
   | -- init (deposit) ------------------------------------> | Open
   | <== manifest / offer ===== |                            |
   | === accept (baseline) ===> |                            |
   | <== 402 payment_required = |                            |
   | === voucher (cumulative) => |   (offline, nothing on-chain)
   | <== service output ======= |                            |
   |                            | -- settle(voucher) ------> | pays delta, stays Open
   | -- close_start ----------------------------------------> | Closing
   |                            | -- close(higher voucher) -> | Closed  (or)
   | -- refund (after window) ------------------------------> | Refunded
```

`===` is local transport (Bluetooth or LAN). `---` is a Stellar transaction.
