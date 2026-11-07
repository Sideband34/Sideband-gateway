# Vouchers

A voucher is a signed statement: "I, the payer, commit to a total of N on this channel". The provider keeps the highest one and presents it to the contract later.

## Why cumulative

A voucher carries the **cumulative** amount owed since the channel opened, not the amount of one payment. This has three effects:

- The provider only needs the latest voucher. Earlier ones are redundant.
- Replaying an old voucher pays nothing, because the contract pays the *difference* above what it already paid.
- A lost voucher costs the provider only the usage since the previous one.

## Amounts

All amounts are fixed-point decimals with seven fractional digits, stored as an integer count of stroops. The grammar is `^(\d{1,18})(?:\.(\d{1,7}))?$`. No sign, no exponent, no spaces, no floats. The canonical string drops trailing zeros: `0.0010` is written `0.001`.

| String | Stroops |
| --- | --- |
| `0.0000001` | 1 |
| `1` | 10,000,000 |
| `2.5` | 25,000,000 |
| `10` | 100,000,000 |

The TypeScript SDK (`parseAmount`, `formatAmount`) and the Dart package (`Amount.parse`, `toString`) implement the same grammar and the same canonical output. A voucher whose `cumulativeAmount` is not canonical is rejected as `malformed`. Amounts must stay below 2^127 because the contract stores `i128`.

## Wire fields

```json
{
  "type": "voucher",
  "v": 1,
  "session": "a8fe4555-fb6d-434c-81fe-9ec552157fdb",
  "channelRef": "CCELZJJND6CW5DPON2UDEEVCZ7BDGDZWNMAQDFJGUFEUNVMSIX2RCYIC",
  "cumulativeAmount": "0.002",
  "commitment": "<64 lowercase hex: sha256 of the signed bytes>",
  "signature": "<128 lowercase hex: ed25519 signature over the signed bytes>"
}
```

- `commitment` is the SHA-256 of the signed bytes. It binds the voucher to its domain and lets the provider detect a mismatch before it verifies the signature.
- `signature` is a 64-byte ed25519 signature, hex encoded, over the signed bytes themselves (not over the hash).

## The signed bytes

The signed bytes are the XDR of a Soroban map with four keys in ascending order: `amount` (i128), `channel` (the contract address), `domain` (the symbol `chancmmt`) and `network` (the SHA-256 of the network passphrase). The full encoding, with test vectors, is on [Commitment encoding](../contract/commitment-encoding.md).

Because the channel address is inside the bytes, a voucher is valid for one channel only. Because the network id is inside the bytes, a Testnet voucher cannot be replayed on another network. The SDK even names this case: if a voucher verifies under a different known network, it returns `wrong_network`, not a generic bad signature.

## Verification and acceptance are separate

| Step | Function | Checks | Stateful |
| --- | --- | --- | --- |
| Verify | `verifyVoucher` | canonical amount, hex shapes, channel match, commitment match, signature | No |
| Accept | `acceptVoucher` | verification, channel not expired, within deposit, within `baseline + maxSpend`, strictly above the stored highest | Yes |

`acceptVoucher` advances the stored highest amount with an atomic compare-and-set. If two requests race, only one wins and the other retries against the new value (up to 8 times by default, then `contention`).

## Failure codes

| Code | Cause |
| --- | --- |
| `malformed` | Non-canonical amount, bad hex, or an unreadable key. |
| `wrong_channel` | `channelRef` differs from the channel the provider bound. |
| `wrong_network` | The signature verifies under a different network passphrase. |
| `commitment_mismatch` | The `commitment` hash does not match the domain and amount. |
| `bad_signature` | The signature is not valid for the payer's key. |
| `channel_expired` | The channel's `expires_at` has passed. |
| `over_deposit` | The amount exceeds the channel deposit. |
| `over_budget` | The amount exceeds `baseline + maxSpend`. |
| `replay` | The same voucher was already accepted. |
| `non_monotonic` | The amount is not above the stored highest. |
| `contention` | The compare-and-set kept losing. Retry. |

## A worked run

This output comes from the SDK example on [Worked example](../sdk/worked-example.md). The channel deposit is `1`, session 1 has `maxSpend` `0.5` and baseline `0`.

| Voucher | Result |
| --- | --- |
| `0.002` | accepted, delta `0.002` |
| `0.004` | accepted, delta `0.002` |
| `0.004` again | refused: `replay` |
| `0.003` | refused: `non_monotonic` |
| `0.6` | refused: `over_budget` |

## A voucher is not money

Acceptance means "the provider may rely on this amount". It does not mean funds moved. The gateway's answer says so explicitly: `COMMITMENT_ACCEPTED_NOT_SETTLED`.
