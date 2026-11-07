# Wire format

The protocol package ([Sideband-protocol](https://github.com/Sideband34/Sideband-protocol), Dart) defines six frame types. The gateway speaks the same frames over HTTP. This page is the exact format.

## Common rules

- Every frame is a JSON object with `type`, `v` (protocol version) and `session`.
- Frames are encoded as **canonical JSON**: object keys sorted by UTF-16 code unit, no whitespace, only `null`, booleans, integers, strings, arrays and objects. There are no floating point numbers. Amounts are strings.
- An encoded frame may not exceed **16 KiB** (`maxFrameBytes = 16 * 1024`). Larger frames are refused on both encode and decode.
- A string field must be non-empty and at most 2048 characters. Integer fields must be non-negative integers.
- `v` must be 1 or 2. Any other value is rejected as `Unsupported protocol version`.
- Canonical JSON is for frame identity and transcript hashes. It is **not** the signed-bytes format of a voucher (see [Commitment encoding](../contract/commitment-encoding.md)).

## Frame types

### `service_offer` (provider to payer)

| Field | Type | Meaning |
| --- | --- | --- |
| `serviceId` | string | Stable service name. |
| `providerPublicKey` | string | Stellar `G…` key of the provider. |
| `pricePerUnit` | amount string | Price of one unit. |
| `unit` | string | Unit name, such as `word`. |
| `currency` | string | Currency label, such as `TEST-TOKEN`. |
| `network` | string | Wire network name, such as `testnet`. |
| `maxSessionUnits` | integer | Most units this session may meter. |
| `expiresAt` | integer | Unix seconds after which the offer is stale. |

Real canonical encoding from the test fixture (290 bytes):

```json
{"currency":"TEST-TOKEN","expiresAt":1300,"maxSessionUnits":1000,"network":"testnet","pricePerUnit":"0.001","providerPublicKey":"GDKUEB62DFEXPXHUNLN75QV4FZ23KLK2RJBBQT7N7XAAAJHQ4PUNUPKW","serviceId":"demo-text-words","session":"sess-fixture-0001","type":"service_offer","unit":"word","v":1}
```

### `session_accept` (payer to provider)

| Field | Type | Meaning |
| --- | --- | --- |
| `channelRef` | string | Channel contract id (`C…`). |
| `maxSpend` | amount string | Budget for this session, on top of `baseline`. |
| `nonce` | string | One-time value. A reuse is refused. |
| `baseline` | amount string | **v2 only.** Channel cumulative already committed. |

A `session_accept` with a zero baseline is encoded as **v1** and carries no `baseline`. With a non-zero baseline it is **v2** and must carry one. A v1 frame that includes `baseline` is rejected. 177 bytes (v1) from the fixture:

```json
{"channelRef":"CCELZJJND6CW5DPON2UDEEVCZ7BDGDZWNMAQDFJGUFEUNVMSIX2RCYIC","maxSpend":"1","nonce":"nonce-fixture-0001","session":"sess-fixture-0001","type":"session_accept","v":1}
```

The same frame as v2 with baseline `0.004` (196 bytes):

```json
{"baseline":"0.004","channelRef":"CCELZJJND6CW5DPON2UDEEVCZ7BDGDZWNMAQDFJGUFEUNVMSIX2RCYIC","maxSpend":"1","nonce":"nonce-fixture-0001","session":"sess-fixture-0001","type":"session_accept","v":2}
```

### `meter_sample` (provider to payer)

| Field | Type | Meaning |
| --- | --- | --- |
| `seq` | integer | Starts at 1 and strictly increases. |
| `cumulativeUnits` | integer | Total units metered so far. Never decreases. |
| `sampleHash` | string | Hash of the sample. |

```json
{"cumulativeUnits":4,"sampleHash":"aa7656e299c395b79782b2461bd21267e894f9903b10f577bc254f5a0cd176c7","seq":1,"session":"sess-fixture-0001","type":"meter_sample","v":1}
```

The gateway computes `sampleHash` as the SHA-256 of the canonical JSON `{session, seq, cumulativeUnits}`. The Dart package ships only a placeholder hasher (`debugSampleHasher`) for tests and examples and expects production code to supply a SHA-256 one.

### `voucher` (payer to provider)

| Field | Type | Meaning |
| --- | --- | --- |
| `channelRef` | string | Channel contract id. |
| `cumulativeAmount` | amount string | Cumulative amount being committed. |
| `commitment` | hex string | SHA-256 of the signed bytes. |
| `signature` | hex string | ed25519 signature over the signed bytes. |

The protocol package carries `commitment` and `signature` opaque. It never verifies them. Verification is the SDK's job (see [Vouchers](../concepts/vouchers.md)). A voucher frame is 376 bytes in the fixture.

### `session_close` (either side)

| Field | Type | Meaning |
| --- | --- | --- |
| `reason` | string | Free-form reason, such as `client_close`. |

### `error` (either side)

| Field | Type | Meaning |
| --- | --- | --- |
| `code` | string | Stable machine-readable code. See [Handshake and errors](handshake-and-errors.md). |
| `message` | string | Human-readable text. |

```json
{"code":"non_monotonic","message":"Cumulative amount must strictly increase","session":"sess-fixture-0001","type":"error","v":1}
```

## Versions

The package encodes each frame with the **lowest version that can represent it**. Only a `session_accept` with a non-zero baseline is v2. Everything else stays byte-identical to v1. The decoder accepts v1 and v2 for every type. A peer that only understands v1 rejects a v2 frame, which is the safe failure: it cannot honour a baseline.

## Amount strings

Amounts follow the grammar in [Vouchers](../concepts/vouchers.md#amounts): up to 18 integer digits and 7 fractional digits, no sign, no exponent.
