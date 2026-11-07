# What is Sideband

## The idea

A phone and a nearby provider, such as a printer, a charger or a hotspot, often cannot reach the internet at the moment of use. Sideband lets them transact anyway.

1. **Online, before the trip:** the payer deposits funds into a Stellar payment channel that names one provider.
2. **Offline, at the provider:** the two devices negotiate a price per unit. The provider meters usage. The payer signs small, growing payment commitments called *vouchers*.
3. **Online, later:** the provider submits the highest voucher to the channel contract. The contract pays the provider and returns the rest to the payer.

A voucher is a promise the contract will honour, not money that moved. Sideband never describes it as final payment. Every receipt, API response and screen says "committed" until the chain confirms.

## Why Stellar and Soroban

The channel is a Soroban contract. It holds the deposit, checks an ed25519 signature on each voucher, and splits the funds. Stellar gives this prototype two things it needs:

- **Cheap, fast settlement.** A voucher can be tiny, and the settlement transaction is a single contract call.
- **Native assets and ed25519 keys.** The payer's voucher key is a normal Stellar ed25519 key. The contract verifies the signature with the host function `ed25519_verify`.

The voucher format is the commitment format of the open-source [`one-way-channel`](https://github.com/stellar-experimental/one-way-channel) contract (Apache-2.0). Sideband names its version `sideband-commit-v2`. See [Commitment encoding](../contract/commitment-encoding.md).

## What is built

| Layer | Built | Verified on Testnet |
| --- | --- | --- |
| Wire protocol (frames, state machine) | Yes, Dart package | Unit tests and shared fixtures only |
| Channel contract | Yes, Rust | Deployed. Settle, close and refund paths ran. See [evidence](../evidence/testnet-evidence.md). |
| TypeScript SDK | Yes | Used by the live gateway run |
| Provider gateway | Yes | Ran against the deployed channel (`ADAPTER=soroban`) |
| Payer app | Yes, Flutter | One real `top_up` through the Dart client. No phone session. |
| BLE transport | Yes | **Not run on hardware** |

## What it is not

- Not audited. Not for real funds.
- Not a wallet. The app keeps one voucher key on the device and the funds stay in the channel.
- Not a general payment network. Each channel pays one provider.
- Not instant settlement. The provider is paid when it submits a voucher on-chain.
