'use client';

import { useId, useState } from 'react';
import { SCALE, fmt, planVoucher } from '@/lib/voucher-math';

const PRICE = 10_000n; // 0.001 per unit (illustrative)
const DEPOSIT = (5n * SCALE) / 100n; // 0.05 deposit (illustrative)

/**
 * Interactive explainer: how the spend cap bounds what the phone signs, and why
 * vouchers are cumulative per channel (a second session starts at a baseline).
 * All numbers are illustrative Testnet amounts, computed with integer math.
 */
export function VoucherExplainer() {
  const id = useId();
  const [units, setUnits] = useState(12);
  const [capMilli, setCapMilli] = useState(20); // 0.020
  const [second, setSecond] = useState(false);
  const cap = BigInt(capMilli) * (SCALE / 1000n);
  const baseline = second ? 15n * PRICE : 0n;
  const plan = planVoucher({ units, pricePerUnit: PRICE, cap, baseline, deposit: DEPOSIT });
  const pct = (v: bigint) => `${Number((v * 10000n) / DEPOSIT) / 100}%`;

  return (
    <div className="explainer">
      <div className="ex-controls">
        <label htmlFor={`${id}-units`}>
          Units used this session <strong className="mono">{units}</strong>
        </label>
        <input
          id={`${id}-units`}
          type="range"
          min={0}
          max={40}
          value={units}
          onChange={(e) => setUnits(Number(e.target.value))}
        />
        <label htmlFor={`${id}-cap`}>
          Your spend cap <strong className="mono">{fmt(cap)}</strong>
        </label>
        <input
          id={`${id}-cap`}
          type="range"
          min={5}
          max={40}
          value={capMilli}
          onChange={(e) => setCapMilli(Number(e.target.value))}
        />
        <label className="ex-toggle">
          <input type="checkbox" checked={second} onChange={(e) => setSecond(e.target.checked)} />
          Second session on the same channel (15 units already signed)
        </label>
        <p className="ex-note">Price 0.001 per unit, deposit 0.05. Illustrative Testnet amounts.</p>
      </div>

      <div className="ex-out" aria-live="polite">
        <div
          className="ex-bar"
          role="img"
          aria-label={`Deposit 0.05: ${fmt(baseline)} from earlier sessions, ${fmt(
            plan.signedInSession,
          )} signed now, cap at ${fmt(baseline + cap)}`}
        >
          <span className="ex-seg ex-base" style={{ width: pct(baseline) }} />
          <span className="ex-seg ex-signed" style={{ width: pct(plan.signedInSession) }} />
          <span
            className="ex-cap"
            style={{ left: pct(baseline + cap < DEPOSIT ? baseline + cap : DEPOSIT) }}
          />
        </div>
        <dl className="ex-facts">
          <div>
            <dt>Meter says owed</dt>
            <dd className="mono">{fmt(plan.owed)}</dd>
          </div>
          <div>
            <dt>Signed this session</dt>
            <dd className="mono">{fmt(plan.signedInSession)}</dd>
          </div>
          <div>
            <dt>Latest voucher (cumulative on channel)</dt>
            <dd className="mono" data-testid="voucher-cumulative">
              {fmt(plan.voucherCumulative)}
            </dd>
          </div>
        </dl>
        <p className={plan.capReached ? 'ex-status is-warn' : 'ex-status'} data-testid="ex-status">
          {plan.capReached
            ? `Cap reached: the phone refuses to sign for ${plan.refusedUnits} more unit${
                plan.refusedUnits === 1 ? '' : 's'
              }, whatever the provider asks.`
            : 'Each new voucher replaces the last one; the provider only ever settles the highest.'}
        </p>
      </div>
    </div>
  );
}
