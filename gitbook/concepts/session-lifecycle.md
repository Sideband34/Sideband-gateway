# Session lifecycle

A *session* is one negotiated period of service between a payer and a provider on a funded channel. Sessions are off-chain. This page covers the session state machine on both sides.

Source: `lib/src/handshake/session.dart` in [Sideband-protocol](https://github.com/Sideband34/Sideband-protocol) and `src/gateway.ts` in [Sideband-gateway](https://github.com/Sideband34/Sideband-gateway).

## Phases

The protocol package defines four phases:

| Phase | Meaning |
| --- | --- |
| `idle` | Nothing sent or received yet. |
| `offered` | An offer exists. The provider has sent it, or the payer received and validated it. |
| `active` | The accept was processed. Meter samples and vouchers are allowed. |
| `closed` | Done. No more frames. |

The gateway stores three phases per session (`offered`, `active`, `closed`) and persists them to SQLite after every change.

## Transitions and the checks on each

### Provider sends the offer

`sendOffer` requires phase `idle` and a frame for this session. It moves to `offered`. In the gateway, `POST /v1/sessions/offer` creates the session with a random id and an expiry of `OFFER_TTL_SEC` (default 300 s).

### Payer receives the offer

`receiveOffer` applies the payer's policy. It refuses, with these error codes:

| Code | Cause |
| --- | --- |
| `wrong_session` | The frame belongs to another session. |
| `wrong_network` | The offer's network differs from the payer's expected network. |
| `wrong_currency` | The currency differs from the expected one. |
| `untrusted_provider` | The provider key is not in the payer's trusted set. |
| `price_too_high` | `pricePerUnit` exceeds the payer's maximum. |
| `stale_offer` | `expiresAt` is in the past. |

The mobile `PayerSession` adds two more checks on top: `wrong_provider` (the offer is not from the channel's provider) and `channel_expired`.

### Provider receives the accept

`receiveAccept` (protocol package) and `acceptSession` (gateway) check, in this order:

1. The session is `offered` and the offer has not expired (`offer_expired`).
2. The channel is known and funded (`no_funded_channel`).
3. The channel is on this gateway's network (`wrong_network`) and bound to this provider (`wrong_provider`).
4. If the gateway has an allowlist, the payer key is on it (`unauthorized_payer`).
5. The channel is `open`, not `closing` (`channel_closing`), not in another terminal status (`channel_not_open`), and not expired (`channel_expired`).
6. No settlement is running on it (`channel_settling`) and no other session is active on it (`channel_in_use`).
7. The accept's `baseline` equals the provider's highest accepted voucher for the channel (`baseline_mismatch`, with `expectedBaseline` in the error body).
8. `maxSpend` is at most `pricePerUnit x maxSessionUnits` (`spend_exceeds_offer`) and `baseline + maxSpend` is at most the deposit (`spend_exceeds_deposit`).
9. The nonce has not been used before (`replayed_nonce`).

Then the session is `active`.

### Meter samples and vouchers

- A meter sample needs `active`, a strictly increasing `seq` (`stale_sample`), non-decreasing units (`meter_regression`) and units within the offered cap (`unit_cap`).
- A voucher must name the session's channel (`wrong_channel`), stay within `baseline + maxSpend` (`over_budget`), and be strictly above the highest so far (`non_monotonic`). Cryptographic checks happen in the SDK before the state machine commits the voucher.

### Close

`close` moves any phase to `closed`. In the gateway, `POST /v1/sessions/{id}/close` does this and frees the channel for the next session. A session also closes with the reason `restore_channel_unavailable` if, after a gateway restart, its channel can no longer be bound as `open` and unexpired.

## Pay before serve

The gateway does not serve work the vouchers do not cover. For each `serve` call it computes what the session would owe after the request. If that is more than the value committed in this session, plus the configured `CREDIT_ALLOWANCE` (default `0`), it answers HTTP `402` with the cumulative amount the payer must sign. See [HTTP API](../gateway/http-api.md#serve).

## One session per channel

Only one session is active on a channel at a time. Sessions on the same channel are sequential and share the channel's cumulative voucher counter through the baseline. See [Protocol v2 baseline](../protocol/baseline-v2.md).
