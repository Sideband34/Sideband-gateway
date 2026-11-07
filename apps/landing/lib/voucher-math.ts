// Fixed-point helpers for the interactive explainers (7 decimals, integer math, like the SDK).
export const SCALE = 10_000_000n;

export function toStroops(units: number, pricePerUnitStroops: bigint): bigint {
  return BigInt(Math.max(0, Math.floor(units))) * pricePerUnitStroops;
}

export function fmt(stroops: bigint): string {
  const neg = stroops < 0n;
  const v = neg ? -stroops : stroops;
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(7, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

export type VoucherPlan = {
  /** Session amount the meter says is owed. */
  owed: bigint;
  /** Session amount actually signed (never above the cap). */
  signedInSession: bigint;
  /** Channel-cumulative value of the latest voucher (baseline + signed). */
  voucherCumulative: bigint;
  /** Units the payer refuses to pay for because the cap is reached. */
  refusedUnits: number;
  capReached: boolean;
};

/**
 * What the payer signs in one session: cumulative per channel, starting at the
 * baseline from earlier sessions, never more than `cap` for this session and
 * never more than the deposit.
 */
export function planVoucher(o: {
  units: number;
  pricePerUnit: bigint;
  cap: bigint;
  baseline: bigint;
  deposit: bigint;
}): VoucherPlan {
  const owed = toStroops(o.units, o.pricePerUnit);
  const room = o.deposit - o.baseline;
  const limit = o.cap < room ? o.cap : room < 0n ? 0n : room;
  const paidUnits = o.pricePerUnit > 0n ? Number(limit / o.pricePerUnit) : 0;
  const signedInSession = owed < limit ? owed : BigInt(paidUnits) * o.pricePerUnit;
  return {
    owed,
    signedInSession,
    voucherCumulative: o.baseline + signedInSession,
    refusedUnits: Math.max(0, Math.floor(o.units) - paidUnits),
    capReached: owed > limit,
  };
}
