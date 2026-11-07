# Transports

A transport moves opaque encoded frames between two devices. It never signs and never interprets a payment.

{% hint style="warning" %}
**Not proven on hardware.** The Bluetooth transport is covered by unit tests with a fake link only. The LAN transport was tested against an in-process server, not across real devices. See [Threat model](../security/threat-model.md#what-is-not-proven).
{% endhint %}

## The interface

From `lib/src/transport/transport.dart`:

```dart
abstract interface class Transport {
  Stream<String> get incoming;          // raw encoded frames
  Future<void> send(String encodedFrame); // completes when handed to the link layer
  Future<void> close();
}
```

`InMemoryTransport.pair()` gives two connected ends for tests and the example `example/loopback.dart`.

## FrameChannel

`FrameChannel` wraps a transport with typed frames, a bounded send queue and bounded retries:

| Setting | Default | Behaviour |
| --- | --- | --- |
| `maxQueue` | 64 | A send beyond 64 pending throws `Send queue full`. The caller applies backpressure. |
| `maxAttempts` | 3 | A failed `send` is retried, then rethrown. |
| `baseDelay` | 50 ms | Delay before retry n is `baseDelay x 2^(n-1)`: 50 ms, then 100 ms. |

`frames` decodes incoming strings with `Frame.decode`. An undecodable frame surfaces as a stream error, not a silent drop, so the caller can penalise a bad peer.

## Bluetooth (BLE GATT)

Source: `lib/transport/ble_transport.dart`, `chunker.dart`, `universal_ble_link.dart` in [Sideband-mobile](https://github.com/Sideband34/Sideband-mobile).

The provider is the GATT peripheral and the payer is the central. The UUIDs are drafts generated for this project. They are not registered with the Bluetooth SIG.

| Item | UUID | Direction |
| --- | --- | --- |
| Service | `6a1d0001-5b8e-4c39-9f2e-2f6d7c1a9b10` | n/a |
| RX characteristic | `6a1d0002-5b8e-4c39-9f2e-2f6d7c1a9b10` | payer to provider, write with response |
| TX characteristic | `6a1d0003-5b8e-4c39-9f2e-2f6d7c1a9b10` | provider to payer, notify |

### Chunking

A frame may be larger than one BLE write. `FrameChunker` splits the UTF-8 bytes of an encoded frame into chunks of `chunkSize` bytes, which is the negotiated ATT MTU minus 3. The payload per write never goes below the BLE minimum of 20.

Each chunk is `[header][payload]`:

| Header bit | Meaning |
| --- | --- |
| bit 7 | `1` on the final chunk of a frame |
| bits 0-6 | Sequence number, modulo 128, starting at 0 for each frame |

`FrameAssembler` reassembles one direction. The sequence number must increase by one inside a frame, so a dropped or reordered chunk is detected and reported, not turned into a corrupt frame. Frames above 16 KiB are refused. The plugin behind the link is `universal_ble` 3.1.2.

## Local network (LAN WebSocket)

`LanTransport` sends one WebSocket text message per encoded frame, bounded to 16 KiB. It uses plain `ws:`. There is **no TLS and no peer authentication** at this layer. Provider identity comes from the signed manifest, not from the link.

## HTTP link to the gateway

`HttpProviderLink` is the app's link to the provider gateway's HTTP API v1. It calls `/v1/sessions/offer`, `/accept`, `/vouchers`, `/serve`, `/usage` and `/close`, and keeps the per-session bearer token the gateway returns with the offer. It can re-attach to a session after an app restart by checking `/usage` for an active session. Plain HTTP is for local demos only.

## Payload limits

| Limit | Value |
| --- | --- |
| Encoded frame | 16 KiB |
| HTTP request body (gateway) | 16 KiB |
| String field | 2048 characters |
