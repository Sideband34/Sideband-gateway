# Sideband

Sideband lets two nearby devices agree on a price, meter a service, and settle the bill on Stellar later. The payer signs small off-chain payment commitments. A Soroban channel contract pays them out when connectivity returns.

{% hint style="warning" %}
**Testnet prototype.** Nothing here has been audited. Everything runs on Stellar Testnet with synthetic or throwaway assets. No phone or Bluetooth hardware test has been done. Read [What is not proven](security/threat-model.md#what-is-not-proven) before you rely on any claim.
{% endhint %}

## Start here

| If you want to... | Read |
| --- | --- |
| Understand the idea in five minutes | [What is Sideband](introduction/what-is-sideband.md), [How it works](introduction/how-it-works.md) |
| Know the exact rules of a channel and a session | [Channel lifecycle](concepts/channel-lifecycle.md), [Session lifecycle](concepts/session-lifecycle.md) |
| Call the contract | [Contract functions](contract/functions.md), [Errors and events](contract/errors-and-events.md) |
| Run a provider gateway | [Provider guide](guides/provider.md), [HTTP API](gateway/http-api.md), [Configuration](gateway/configuration.md) |
| Build a payer | [Payer guide](guides/payer.md), [Channels SDK](sdk/channels-sdk.md), [Mobile app](mobile/overview.md) |
| See what was verified on Testnet | [Testnet evidence](evidence/testnet-evidence.md) |
| Contribute and earn Wave points | [Contributing](project/contributing.md) |

## The four repositories

| Repository | Owns | Language |
| --- | --- | --- |
| [Sideband-protocol](https://github.com/Sideband34/Sideband-protocol) | Wire frames, the session state machine, the usage meter, the transport interface | Dart |
| [Sideband-channels](https://github.com/Sideband34/Sideband-channels) | The Soroban channel contract and the TypeScript SDK for vouchers and settlement | Rust, TypeScript |
| [Sideband-gateway](https://github.com/Sideband34/Sideband-gateway) | The provider gateway (HTTP 402, sessions, settlement) and the landing page. These docs live here too. | TypeScript |
| [Sideband-mobile](https://github.com/Sideband34/Sideband-mobile) | The payer app: key storage, session journal, channel actions, BLE and LAN transports | Dart, Flutter |

## Live pieces

| Piece | Address | Note |
| --- | --- | --- |
| Landing page | <https://sideband-web1.vercel.app> | Vercel, built from `apps/landing` |
| Demo gateway | <https://sideband-gateway.onrender.com> | Render free plan, **synthetic test adapter only**, sleeps when idle |
| Channel contract on Testnet | [`CD67A4SD…5OTS`](https://stellar.expert/explorer/testnet/contract/CD67A4SD2ZWA4BPWVCJKSJ3AI4TJCHEJRUJIDUPPOWT4CEQAJOMS5OTS) | Smoke-tested, see [evidence](evidence/testnet-evidence.md) |

## How these docs are built

This folder is plain Markdown in [Sideband-gateway](https://github.com/Sideband34/Sideband-gateway/tree/main/gitbook). GitBook imports it through Git Sync (`.gitbook.yaml` at the repository root points here). Every number and code sample was taken from the repository or run on the author's machine. Where something was not run, the page says so.
