# Glossary

| Term | Meaning |
| --- | --- |
| Amount | A non-negative decimal with up to 7 fractional digits, such as `0.0010`. Stored as an integer count of stroops. No floating point anywhere. See [Vouchers](vouchers.md#amounts). |
| Baseline | The highest voucher amount already committed on a channel before a session starts. Sent in `session_accept` from protocol v2. |
| Binding | The provider's cached view of a funded channel: payer, provider, deposit, expiry, status, withdrawn amount. |
| Channel | One Soroban contract instance that holds a deposit for exactly one payer and one provider. |
| `close` | Provider call. Withdraws up to its highest voucher and refunds the rest. Terminal. |
| `close_start` | Payer call. Opens the dispute window. |
| `close_wait` | Length of the dispute window in seconds. 60 to 2,678,400 (31 days). |
| `close_effective_at` | When `refund` becomes possible: `max(close_start time + close_wait, expires_at)`. |
| Commitment | The bytes a payer signs for a cumulative amount. XDR of a map with `amount`, `channel`, `domain`, `network`. |
| Cumulative amount | Total owed on a channel since it opened, not the amount of one payment. Vouchers carry cumulative amounts. |
| Deposit | Everything ever put in the channel: the initial deposit plus top-ups. |
| Dispute window | The period after `close_start` in which the provider may still settle a higher voucher. |
| Frame | One protocol message: `service_offer`, `session_accept`, `meter_sample`, `voucher`, `session_close` or `error`. |
| Intent | The gateway's record of a settlement it prepared or submitted. States: `CREATED`, `AUTHORIZED`, `SUBMITTED`, `RECONCILING`, `CONFIRMED`, `FAILED`. |
| Manifest | A provider-signed description of the service and price. |
| `maxSpend` | The most the payer will commit in one session, on top of the baseline. |
| Meter | A monotonic usage counter. Units only go up. |
| Nonce | A one-time string in `session_accept`. A reused nonce is refused. |
| `payer_key` | The raw ed25519 public key stored in the channel. It verifies voucher signatures. |
| `refund` | Payer call after the dispute window. Returns the unsettled balance. Terminal. |
| `settle` | Provider call. Withdraws up to the voucher amount and keeps the channel open. |
| Session | One offer-accept-use-close exchange between a payer and a provider on a channel. |
| Stroop | `0.0000001`, the smallest unit. |
| Test adapter | The in-memory channel adapter. It sends no transactions and every receipt is marked `synthetic`. |
| Voucher | A signed commitment to a cumulative amount. Not settled funds. |
