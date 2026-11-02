'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconWifiOff } from './Icons';

// Mirrors the gateway's real demo service: per-word upper-casing at 0.001 TEST-TOKEN per word.
const WORDS = [
  'hello',
  'from',
  'the',
  'device',
  'next',
  'to',
  'you',
  'one',
  'word',
  'at',
  'a',
  'time',
];
const CAP_UNITS = 20; // spend cap 0.020 TEST-TOKEN
const START = 6;
const TICK_MS = 1500;
const HOLD_TICKS = 3;

/** Integer minor units (1/1000) to a display string. No binary floats. */
export const formatAmount = (units: number) => `0.${String(units).padStart(3, '0')}`;

type State = { units: number; hold: number };

const tick = ({ units, hold }: State): State => {
  if (units < WORDS.length) return { units: units + 1, hold: 0 };
  // Every word delivered: hold the "closed" state briefly, then start a fresh session.
  if (hold < HOLD_TICKS) return { units, hold: hold + 1 };
  return { units: 1, hold: 0 };
};

export function HeroDemo() {
  const [{ units }, setState] = useState<State>({ units: START, hold: 0 });

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduce?.matches) return;
    const id = window.setInterval(() => setState(tick), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const closed = units >= WORDS.length;
  const amount = formatAmount(units);
  const pct = Math.round((units / CAP_UNITS) * 100);

  return (
    <figure className="demo" aria-labelledby="demo-caption">
      <figcaption id="demo-caption" className="sr-only">
        Illustration of a synthetic Sideband session: the provider device returns one processed word
        per unit, and the payer phone signs a cumulative voucher for each one. Both devices are
        offline; the vouchers are commitments that settle on Stellar Testnet later.
      </figcaption>
      <div className="demo-inner" aria-hidden="true">
        <div className="demo-bar">
          <span className="demo-dot" />
          <span className="demo-title">Session sess-0001</span>
          <span className="pill pill-muted">
            <IconWifiOff size={14} /> Internet off
          </span>
        </div>

        <div className="demo-stage">
          <div className="device device-payer">
            <div className="device-notch" />
            <p className="device-label">Payer phone</p>
            <p className="device-amount mono">{amount}</p>
            <p className="device-sub">TEST-TOKEN committed</p>
            <div className="meter" role="presentation">
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="device-sub mono">cap {formatAmount(CAP_UNITS)}</p>
            <p className="device-words">
              {WORDS.slice(0, units).map((w, i) => (
                <span key={`${w}-${i}`} className="word">
                  {w.toUpperCase()}
                </span>
              ))}
            </p>
          </div>

          <div className="demo-link">
            <svg viewBox="0 0 80 200" preserveAspectRatio="none" className="link-lines">
              <path d="M0 70 C 30 70, 50 70, 80 70" />
              <path d="M80 130 C 50 130, 30 130, 0 130" />
            </svg>
            {!closed && (
              <>
                <span key={`v${units}`} className="chip chip-voucher mono">
                  #{units}
                </span>
                <span key={`u${units}`} className="chip chip-unit mono">
                  +1
                </span>
              </>
            )}
            <span className="link-label">BLE · local</span>
          </div>

          <div className="device device-provider">
            <p className="device-label">Provider</p>
            <p className="device-service">Demo text service</p>
            <p className="device-sub mono">0.001 / word</p>
            <ul className="verify-list">
              <li>
                <IconCheck size={14} /> Signature
              </li>
              <li>
                <IconCheck size={14} /> Channel &amp; network
              </li>
              <li>
                <IconCheck size={14} /> Amount ↑ only
              </li>
            </ul>
            <p className="device-sub">Highest voucher</p>
            <p className="device-amount device-amount-sm mono">{amount}</p>
          </div>
        </div>

        <div className={closed ? 'demo-status is-closed' : 'demo-status'}>
          {closed ? (
            <>
              <span className="pill pill-warn">Session closed</span>
              <span>{amount} committed · settles on Stellar when back online</span>
            </>
          ) : (
            <>
              <span className="pill pill-accent">Voucher #{units} verified locally</span>
              <span>Commitment, not settled</span>
            </>
          )}
        </div>
      </div>
    </figure>
  );
}
