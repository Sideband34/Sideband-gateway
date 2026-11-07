# Trust model

Who has to trust whom, and what happens when they are wrong.

## What each party can do

| Party | Can | Cannot |
| --- | --- | --- |
| Payer | Sign vouchers up to its deposit. Start a close. Reclaim the unsettled balance after the window. | Take back money the provider already withdrew. Sign a voucher for a different channel and have it pay out. |
| Provider | Withdraw up to the highest valid voucher. Close the channel and return the remainder to the payer. | Withdraw more than the highest voucher, or more than the deposit. Shorten the dispute window. |
| Anyone else | Read the channel. | Move funds. Every state change needs the payer's or the provider's authorisation (`require_auth`). |

## Risks by party

### The payer's risk

- **Provider does not deliver.** The payer has committed only as much as it signed. It signs a voucher only when the provider asks for payment for work it is about to do. The pay-before-serve flow means the payer is at most one request ahead.
- **Provider never settles.** The payer can `close_start` and `refund` after the window. The deposit is not lost. The cost is waiting up to `max(close_wait, time to expiry)`.
- **Signed but undelivered voucher.** The mobile app records the new high-water mark before it signs. After a crash it re-sends the identical voucher or records the session as interrupted.

### The provider's risk

- **Payer vanishes after service.** The provider holds the highest voucher. It can settle at any time before `close_effective_at`, and also afterwards as long as the channel is not `Refunded`.
- **Payer starts a close and the provider is offline.** If the provider does not present its highest voucher before the window ends, the payer can refund the rest. The unsettled value is lost. The gateway's watcher (`AUTO_SETTLE_INTERVAL_SEC`, default 60 s) answers a payer `close_start` with the highest voucher automatically.
- **Channel too small.** The deposit caps total spending. The gateway refuses a session when `baseline + maxSpend` exceeds the deposit.
- **Credit given.** `CREDIT_ALLOWANCE` lets the provider serve a little beyond the highest voucher. The default is `0`.

### What neither can do alone

A provider cannot invent a voucher: it does not have the payer's key. A payer cannot cancel a voucher the provider already holds without waiting out the dispute window, and then only for the amount the provider did not present.

## Where the trust anchors are

| Anchor | Established how |
| --- | --- |
| Provider identity for a payer | A provider key the payer trusted out of band, checked against the signed manifest and every offer. |
| Channel funding for a provider | The provider reads the channel from the chain (Soroban adapter) or its cache, and refuses a session on an unfunded or foreign channel. |
| Payer identity for the contract | The `payer_key` stored at `init`. The contract verifies every voucher against it. |

## Transport is untrusted

Transports (Bluetooth, LAN WebSocket) move opaque frames. They never sign or interpret payments. The LAN transport uses plain `ws:` with no TLS and no peer authentication, so provider identity rests on the signed manifest, not on the link. Frames are bounded to 16 KiB.

## What this model does not cover

- A malicious token contract. The channel calls the token's `transfer`. Use a Stellar Asset Contract you trust.
- Key theft. Anyone with the payer's voucher key can sign vouchers.
- Legal or compliance questions. This is a Testnet prototype.

See [Threat model](../security/threat-model.md).
