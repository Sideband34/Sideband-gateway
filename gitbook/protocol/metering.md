# Metering

The meter counts what was used. The payer signs vouchers for what the meter says is owed.

## Rules

Both implementations follow the same rules. The Dart `UsageMeter` is in the protocol package. The TypeScript `UsageMeter` is in the gateway (`src/metering/meter.ts`).

| Rule | Behaviour |
| --- | --- |
| Monotonic | Units only go up. `record(n)` needs `n > 0`. |
| Capped | `record` fails if the total would exceed `maxUnits`. The gateway answers `unit_cap`. |
| Owed amount | `owed = pricePerUnit x units`, computed with integers. |
| Sequence | `seq` increases by 1 for every `record`. |

The gateway restores `units` and `seq` from SQLite after a restart. `restore` rejects a value above the cap or negative.

## Pay before serve

The gateway meters a request **after** it checks the vouchers cover it:

1. Count the words in the request. Zero words is `invalid_request`.
2. Check the request fits under `maxSessionUnits` (`unit_cap` otherwise).
3. Compute `newOwed = owed so far + price x words`.
4. Compare with the value committed in this session plus `CREDIT_ALLOWANCE`. If `newOwed` is higher, answer `402` with the amounts the payer needs.
5. Only then run the service and record the units.

The demo service upper-cases the text and bills one unit per word. It exists only to exercise metering and vouchers. Input is limited to 2000 characters on the service and 4000 on the HTTP body schema.

## Payer-side meter report

The payer can send its own unit count to `POST /v1/sessions/{id}/meter`. The gateway answers with its own sample and the difference:

```json
{"seq":1,"cumulativeUnits":2,
 "sampleHash":"111077749748ccd574c3fe255f32bb925178b2c0addf9d22758ec3b8d1d2e3e0",
 "payerCumulativeUnits":2,"discrepancyUnits":0,"match":true}
```

A non-zero `discrepancyUnits` is information only. The gateway does not charge differently because of it. The payer decides what to sign.

## Meter samples on the wire

A `meter_sample` frame carries `seq`, `cumulativeUnits` and `sampleHash`. The receiving `SessionMachine` rejects a non-increasing `seq` (`stale_sample`), decreasing units (`meter_regression`) and units above the offered cap (`unit_cap`). See [Handshake and errors](handshake-and-errors.md).

## What the payer does with a sample

The mobile `PayerSession` computes `owed = pricePerUnit x cumulativeUnits`. If `owed` exceeds its budget cap it closes the session with the reason `budget_exhausted` and raises `BudgetExceeded`. It never signs above the cap. Otherwise it signs for `baseline + owed`, unless the stored high-water mark already covers it.
