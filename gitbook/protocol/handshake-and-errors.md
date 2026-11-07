# Handshake and errors

The `SessionMachine` class in the protocol package enforces the rules of a session. Both sides use it. A broken rule throws a `SessionViolation` with a stable `code`. The same code goes into an `error` frame.

## Methods

| Method | Used by | Requires phase | Result phase |
| --- | --- | --- | --- |
| `sendOffer(offer)` | provider | `idle` | `offered` |
| `receiveOffer(offer, policy)` | payer | `idle` | `offered` |
| `receiveAccept(accept, knownChannelRefs, channelCumulative)` | provider | `offered` | `active` |
| `sendAccept(accept)` | payer | `offered` | `active` |
| `receiveSample(sample)` | payer | `active` | `active` |
| `commitVoucher(voucher)` | provider | `active` | `active` |
| `close()` | either | any | `closed` |

Calling a method in the wrong phase gives `bad_state`.

## Payer policy

`receiveOffer` checks the offer against a `PayerPolicy`:

| Field | Check |
| --- | --- |
| `expectedNetwork` | Offer network must match. |
| `expectedCurrency` | Offer currency must match. |
| `maxPricePerUnit` | Offer price must not exceed it. |
| `trustedProviderKeys` | Offer's provider key must be in the set. |

## Error codes

| Code | Raised when |
| --- | --- |
| `wrong_session` | A frame carries a different session id. |
| `bad_state` | A method is called in the wrong phase. |
| `wrong_network` | Offer network differs from the payer's expected one. |
| `wrong_currency` | Offer currency differs from the expected one. |
| `untrusted_provider` | Provider key not in the trusted set. |
| `price_too_high` | Offer price above the payer cap. |
| `stale_offer` | `expiresAt` has passed (checked on receive and again on accept). |
| `no_funded_channel` | The accept names a channel the provider does not know. |
| `baseline_mismatch` | Accept's `baseline` differs from the provider's highest accepted amount. |
| `replayed_nonce` | The accept's nonce was already used. |
| `spend_exceeds_offer` | `maxSpend` above `pricePerUnit x maxSessionUnits`. |
| `stale_sample` | Meter `seq` did not increase. |
| `meter_regression` | Meter units decreased. |
| `unit_cap` | Meter units above `maxSessionUnits`. |
| `wrong_channel` | Voucher names another channel than the accept. |
| `over_budget` | Voucher above `baseline + maxSpend`. |
| `non_monotonic` | Voucher not above the highest so far. |

The payer app adds `wrong_provider`, `channel_expired` and `channel_exhausted` (the deposit is already fully committed, so the channel needs a top-up). The gateway exposes its own HTTP error bodies from the handlers in [its source](https://github.com/Sideband34/Sideband-gateway/tree/main/src/http).

## Voucher checks are structural here

`commitVoucher` does **not** verify signatures. It checks structure only: channel, budget and monotonicity. The caller must verify the signature with the SDK first. This keeps the protocol package free of chain and crypto dependencies.

## Time is injected

The machine takes a `now` function (unix seconds) so tests control the clock. The mobile app pins it to the accept time when it resumes a session after a crash, so an offer that has expired since does not block resuming.

## Provider's highest amount and the baseline

`highestCumulative` starts at the accepted baseline. `sessionSpend` is `highest - baseline`. See [Protocol v2 baseline](baseline-v2.md).
