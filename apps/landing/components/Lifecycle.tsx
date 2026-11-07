'use client';

import { useState } from 'react';

type Step = {
  call: string;
  who: 'Payer' | 'Provider';
  state: 'Open' | 'Closing' | 'Closed' | 'Refunded';
  deposit: number;
  paid: number;
  refunded: number;
  note: string;
};

// Worked example (illustrative Testnet amounts). Invariant on every row:
// deposit = paid to provider + refunded + still held.
const STEPS: Step[] = [
  {
    call: 'init',
    who: 'Payer',
    state: 'Open',
    deposit: 10,
    paid: 0,
    refunded: 0,
    note: 'Payer locks 10 in the channel while online.',
  },
  {
    call: 'top_up',
    who: 'Payer',
    state: 'Open',
    deposit: 15,
    paid: 0,
    refunded: 0,
    note: 'More funds can be added to an open channel.',
  },
  {
    call: 'settle',
    who: 'Provider',
    state: 'Open',
    deposit: 15,
    paid: 4,
    refunded: 0,
    note: 'Provider withdraws up to its highest voucher (4). The channel stays open for later sessions.',
  },
  {
    call: 'close_start',
    who: 'Payer',
    state: 'Closing',
    deposit: 15,
    paid: 4,
    refunded: 0,
    note: 'Payer asks to close. A dispute window starts; it never ends before the channel expiry.',
  },
  {
    call: 'settle',
    who: 'Provider',
    state: 'Closing',
    deposit: 15,
    paid: 6,
    refunded: 0,
    note: 'Inside the window the provider can still submit a higher voucher (6).',
  },
  {
    call: 'refund',
    who: 'Payer',
    state: 'Refunded',
    deposit: 15,
    paid: 6,
    refunded: 9,
    note: 'After the window the payer reclaims the rest. Terminal: nothing can move again.',
  },
];

/** Animated walkthrough of the reference contract's calls (contracts/channel). */
export function Lifecycle() {
  const [i, setI] = useState(0);
  const s = STEPS[i]!;
  const held = s.deposit - s.paid - s.refunded;
  const w = (v: number) => `${(v / 15) * 100}%`;
  return (
    <div className="lifecycle">
      <ol className="lc-steps">
        {STEPS.map((x, k) => (
          <li key={k}>
            <button
              type="button"
              className={`lc-step${k === i ? ' is-active' : ''}${k < i ? ' is-done' : ''}`}
              aria-current={k === i ? 'step' : undefined}
              onClick={() => setI(k)}
            >
              <span className="mono">{x.call}</span>
              <small>{x.who}</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="lc-panel" aria-live="polite">
        <div className="lc-head">
          <span className={`lc-state lc-${s.state.toLowerCase()}`}>{s.state}</span>
          <p>{s.note}</p>
        </div>
        <div
          className="lc-bar"
          role="img"
          aria-label={`Deposit ${s.deposit}: ${s.paid} paid to provider, ${s.refunded} refunded, ${held} held`}
        >
          <span className="lc-seg lc-paid" style={{ width: w(s.paid) }} />
          <span className="lc-seg lc-held" style={{ width: w(held) }} />
          <span className="lc-seg lc-refunded" style={{ width: w(s.refunded) }} />
        </div>
        <dl className="lc-legend" data-testid="lc-legend">
          <div>
            <dt>Deposited</dt>
            <dd className="mono">{s.deposit}</dd>
          </div>
          <div>
            <dt>
              <i className="lc-dot lc-paid" /> Paid to provider
            </dt>
            <dd className="mono">{s.paid}</dd>
          </div>
          <div>
            <dt>
              <i className="lc-dot lc-held" /> Held
            </dt>
            <dd className="mono">{held}</dd>
          </div>
          <div>
            <dt>
              <i className="lc-dot lc-refunded" /> Refunded
            </dt>
            <dd className="mono">{s.refunded}</dd>
          </div>
        </dl>
        <div className="lc-nav">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={i === 0}
            onClick={() => setI(i - 1)}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={i === STEPS.length - 1}
            onClick={() => setI(i + 1)}
          >
            Next call
          </button>
        </div>
        <p className="ex-note">
          Alternative ending: the provider calls <span className="mono">close</span> with its
          highest voucher, which pays it and refunds the rest in one step. Illustrative amounts; the
          contract is unaudited and not deployed.
        </p>
      </div>
    </div>
  );
}
