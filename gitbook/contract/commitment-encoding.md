# Commitment encoding

The bytes a payer signs for a voucher are called the *commitment*. They follow the format of the open-source [`one-way-channel`](https://github.com/stellar-experimental/one-way-channel) contract (Apache-2.0, commit `25dea1b`), so a voucher is interoperable with tooling built for that format. Sideband calls the format `sideband-commit-v2`.

{% hint style="info" %}
The format was checked against the deployed contract on Testnet: `prepare_commitment` returned bytes identical to the local encoder. It was not verified against a live deployment of the upstream contract itself, and upstream is unaudited too.
{% endhint %}

## Definition

The commitment is the XDR encoding of one Soroban `ScVal::Map` with four entries in ascending key order:

| Key (symbol) | Value | Type |
| --- | --- | --- |
| `amount` | The cumulative amount in stroops | `i128` |
| `channel` | The channel contract address | `Address` |
| `domain` | The constant `chancmmt` | `Symbol` |
| `network` | SHA-256 of the network passphrase | 32 bytes |

The channel address binds a voucher to one channel. Payer and provider are not in the bytes, because they are fixed in the channel's storage. The network id binds it to one network. For Testnet the network id is `cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472`, the SHA-256 of `Test SDF Network ; September 2015`.

On chain, the contract builds the same map with `voucher_preimage` and verifies the signature with `ed25519_verify(payer_key, preimage, signature)`.

## Byte layout

Every commitment is exactly **192 bytes**. For amount `1` (10,000,000 stroops) on the fixture channel, the hex is:

```
00000011                       ScVal type: map
00000001                       map present
00000004                       4 entries
  0000000f 00000006 616d6f756e74 0000       key symbol "amount" (6 bytes + 2 padding)
  0000000a 0000000000000000 0000000000989680   value i128 = 10000000
  0000000f 00000007 6368616e6e656c 00       key symbol "channel"
  00000012 00000001 0909...09 (32 bytes)    value address, type contract
  0000000f 00000006 646f6d61696e 0000       key symbol "domain"
  0000000f 00000008 6368616e636d6d74        value symbol "chancmmt"
  0000000f 00000007 6e6574776f726b 00       key symbol "network"
  0000000d 00000020 cee0302d...ecd472       value bytes (32)
```

The size adds up: 12 header bytes, 36 for the amount entry, 56 for channel, 32 for domain and 56 for network, which is 192.

## Test vectors

`fixtures/voucher-vectors.json` in Sideband-channels holds synthetic vectors for four amounts. The same file is mirrored in the mobile app. The vectors use this domain:

| Field | Value |
| --- | --- |
| Network | `Test SDF Network ; September 2015` |
| Channel | `CAEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQSCIJBEEQTD2L` (raw id `0909…09`) |
| Payer key | `GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR` |

| Cumulative amount | Stroops | Commitment (SHA-256 of the bytes) |
| --- | --- | --- |
| `0.0000001` | 1 | `e5bb8c77f8b32b65a41bc55846ed020bec2a613b538899892be38d7b3eaf3707` |
| `1` | 10,000,000 | `cb6868ef648555bc037c815ed8a951bc2f40a2291b61ea94884bfc23d2e7751c` |
| `2.5` | 25,000,000 | `dcfa30afd04d5c7e94ff9db3cfdc7a49493e3c6d8ea052affa8fa320cb42b5a3` |
| `10` | 100,000,000 | `5bf93e138f6a17e67a900380ffb2215f8a3e47e1314ee7ab6bacef8a5b53178b` |

These were reproduced with the SDK's `buildPreimage`: for all four vectors the preimage and the commitment match the fixture byte for byte, and each preimage is 192 bytes. The vectors are **synthetic test data**. Do not reuse their keys.

## Reproduce it

Run this in `Sideband-gateway` after building the channels SDK (see [Local setup](../developers/local-setup.md)):

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildPreimage, parseAmount } from '@sideband/channels';

const f = JSON.parse(readFileSync('../Sideband-channels/fixtures/voucher-vectors.json', 'utf8'));
const domain = {
  networkPassphrase: f.networkPassphrase,
  channelId: f.channelId,
  payer: f.payer,
  provider: f.provider,
};
for (const v of f.vectors) {
  const pre = Buffer.from(buildPreimage(domain, parseAmount(v.cumulativeAmount))).toString('hex');
  const c = createHash('sha256').update(Buffer.from(pre, 'hex')).digest('hex');
  console.log(
    v.cumulativeAmount.padEnd(10),
    'stroops',
    v.cumulativeStroops.padEnd(10),
    'preimage matches fixture:',
    pre === v.preimageHex,
    '| commitment matches:',
    c === v.commitment,
    '| preimage bytes',
    pre.length / 2,
  );
}
```

Output when this was run:

```
0.0000001  stroops 1          preimage matches fixture: true | commitment matches: true | preimage bytes 192
1          stroops 10000000   preimage matches fixture: true | commitment matches: true | preimage bytes 192
2.5        stroops 25000000   preimage matches fixture: true | commitment matches: true | preimage bytes 192
10         stroops 100000000  preimage matches fixture: true | commitment matches: true | preimage bytes 192
```

## Wire fields derived from the bytes

A voucher carries `commitment` (lowercase hex SHA-256 of these bytes) and `signature` (lowercase hex ed25519 signature over these bytes). See [Vouchers](../concepts/vouchers.md).
