# Protocol v2: the session baseline

Source: ADR 0001 in [Sideband-protocol](https://github.com/Sideband34/Sideband-protocol/blob/main/docs/adr/0001-session-baseline.md).

## The problem

Vouchers are cumulative per **channel**. The contract pays the provider up to the highest signed amount for the channel. Early versions of the session logic budgeted per **session**: `maxSpend` was compared with the voucher's channel-cumulative amount. A second session on the same channel would then be wrong in one of two ways:

- earlier commitments would count against the new session's budget, or
- the provider could treat earlier commitments as payment for new usage.

The gateway and the app therefore refused to reuse a channel, which forces a new on-chain deposit for every session.

## The decision

Protocol v2 adds one field to `session_accept`: `baseline`, the channel's cumulative amount committed before this session.

- The payer may sign vouchers up to `baseline + maxSpend` in this session.
- Each voucher must be strictly above the current highest, which starts at `baseline`.
- The provider must refuse with `baseline_mismatch` unless `baseline` equals its own highest accepted voucher for the channel:
  - a **lower** baseline would let old commitments pay for new usage,
  - a **higher** one would make the payer pay twice.
- Only one session is active on a channel at a time. Sessions are sequential.

## Worked example

Real output from the gateway on the test adapter. Price `0.001` per word.

**Session 1.** The payer accepts with `v: 1`. A request for two words returns `402` asking for cumulative `0.002`. The payer sends that voucher. The provider's highest is now `0.002`.

**Session 2.** The payer first tries baseline `0`. The gateway refuses and says what it expects:

```json
{"error":{"code":"baseline_mismatch",
 "message":"Session baseline must equal the channel cumulative already committed",
 "expectedBaseline":"0.002"}}
```

The payer re-sends the accept as v2 with `baseline: "0.002"`. It is accepted. A request for three words now returns:

```json
{"error":{"code":"payment_required",
 "requiredCumulative":"0.005","currentCumulative":"0.002","sessionOwed":"0.003"}}
```

`requiredCumulative` is the **channel** cumulative the payer must sign: baseline `0.002` plus this session's owed `0.003`. `sessionOwed` is only this session's part.

## Encoding rule

A `session_accept` with `baseline == 0` is still encoded as v1 and is byte-identical to the old format. A non-zero baseline is encoded as `"v":2`. All other frames stay v1. See [Wire format](wire-format.md#versions).

## Consequences

- Several sequential sessions can share one funded channel. Combined with partial `settle` (see [Channel lifecycle](../concepts/channel-lifecycle.md)), a long-running provider gets paid while the channel stays open.
- v1-only peers reject v2 frames.
- `SessionAccept` in Dart is no longer a `const` constructor, because it defaults `baseline`.

## What the payer stores

The payer app records the highest amount it has ever signed per channel (the *signed ledger*). That value is the baseline it offers in the next session. If the provider's record is lower than what the payer signed, for example after a crash that lost a voucher in transit, the app raises `BaselineGap` and signs nothing until the user decides.
