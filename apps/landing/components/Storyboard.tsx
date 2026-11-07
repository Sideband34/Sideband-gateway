'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const PHASES = [
  {
    id: 'fund',
    net: 'Online',
    title: 'Fund the channel on Soroban',
    body: 'While connected, the payer deposits Testnet funds into a payment channel bound to one provider. This is the only step that moves money on-chain before the session.',
  },
  {
    id: 'stream',
    net: 'Offline',
    title: 'Pair over BLE and stream vouchers',
    body: 'Nearby, the phones pair and agree a spending cap. As service units tick, the payer signs a higher cumulative voucher; the provider checks each one locally.',
  },
  {
    id: 'settle',
    net: 'Online',
    title: 'Back online, the provider settles',
    body: 'The provider submits its highest voucher. It can withdraw and keep the channel open for later sessions, or close it and refund the rest to the payer.',
  },
] as const;

function Phone({ x, label }: { x: number; label: string }) {
  return (
    <g transform={`translate(${x} 60)`}>
      <rect width="64" height="112" rx="12" className="sb-phone" />
      <rect x="8" y="14" width="48" height="76" rx="4" className="sb-screen" />
      <text x="32" y="132" textAnchor="middle" className="sb-label">
        {label}
      </text>
    </g>
  );
}

function Chain({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 70)`} className="sb-chain">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 26} y={i % 2 ? 18 : 0} width="40" height="40" rx="8" />
      ))}
      <text x="46" y="110" textAnchor="middle" className="sb-label">
        Soroban channel
      </text>
    </g>
  );
}

function Scene({ phase }: { phase: number }) {
  if (phase === 0) {
    return (
      <>
        <Phone x={40} label="Payer" />
        <Chain x={300} />
        <path d="M112 116 H290" className="sb-wire" />
        <g className="sb-coin sb-move-right">
          <circle cx="130" cy="116" r="11" />
          <text x="130" y="120" textAnchor="middle">
            ¤
          </text>
        </g>
        <text x="200" y="100" textAnchor="middle" className="sb-caption">
          deposit
        </text>
      </>
    );
  }
  if (phase === 1) {
    return (
      <>
        <Phone x={40} label="Payer" />
        <Phone x={316} label="Provider" />
        <g className="sb-waves" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${150 + i * 18} 92 q 14 24 0 48`}
              className="sb-wave"
              style={{ animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </g>
        <g className="sb-voucher sb-move-right">
          <rect x="120" y="140" width="66" height="26" rx="6" />
          <text x="153" y="157" textAnchor="middle">
            voucher
          </text>
        </g>
        <g className="sb-unit sb-move-left">
          <rect x="226" y="66" width="56" height="22" rx="11" />
          <text x="254" y="81" textAnchor="middle">
            +1 unit
          </text>
        </g>
        <text x="220" y="40" textAnchor="middle" className="sb-caption">
          no internet in this step
        </text>
      </>
    );
  }
  return (
    <>
      <Chain x={40} />
      <Phone x={316} label="Provider" />
      <path d="M150 116 H306" className="sb-wire" />
      <g className="sb-voucher sb-move-left">
        <rect x="236" y="103" width="66" height="26" rx="6" />
        <text x="269" y="120" textAnchor="middle">
          highest
        </text>
      </g>
      <text x="228" y="92" textAnchor="middle" className="sb-caption">
        settle
      </text>
    </>
  );
}

const REDUCE = '(prefers-reduced-motion: reduce)';
const hasMM = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';
function subscribeMotion(cb: () => void) {
  if (!hasMM()) return () => {};
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}
/** Motion only when the user has not asked for reduced motion (and the API exists). */
function motionAllowed() {
  return hasMM() && !window.matchMedia(REDUCE).matches;
}

/** Animated three-phase storyboard. Autoplays only when motion is allowed. */
export function Storyboard() {
  const [phase, setPhase] = useState(0);
  const [paused, setPaused] = useState(false);
  const motionOk = useSyncExternalStore(subscribeMotion, motionAllowed, () => false);
  const auto = motionOk && !paused;

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 4200);
    return () => clearInterval(t);
  }, [auto]);

  const p = PHASES[phase]!;
  return (
    <div className="storyboard">
      <div className="sb-tabs" role="tablist" aria-label="Session phases">
        {PHASES.map((x, i) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            id={`sb-tab-${x.id}`}
            aria-selected={i === phase}
            aria-controls="sb-panel"
            className={`sb-tab${i === phase ? ' is-active' : ''}`}
            onClick={() => {
              setPhase(i);
              setPaused(true);
            }}
          >
            <span className="mono">0{i + 1}</span> {x.net}
          </button>
        ))}
      </div>
      <div className="sb-panel" role="tabpanel" id="sb-panel" aria-labelledby={`sb-tab-${p.id}`}>
        <svg
          key={p.id}
          viewBox="0 0 420 210"
          className="sb-svg"
          role="img"
          aria-label={`Illustration: ${p.title}`}
        >
          <Scene phase={phase} />
        </svg>
        <div className="sb-copy">
          <span className={`net net-${p.net.toLowerCase()}`}>{p.net}</span>
          <h3>{p.title}</h3>
          <p>{p.body}</p>
          {motionOk && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPaused((x) => !x)}
            >
              {auto ? 'Pause' : 'Play'} animation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
