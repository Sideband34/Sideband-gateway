import { createHash } from 'node:crypto';
import { canonicalJson } from '../canonical.js';

export class MeterError extends Error {
  constructor(
    readonly code: 'unit_cap' | 'invalid_units',
    message: string,
  ) {
    super(message);
    this.name = 'MeterError';
  }
}

/** Monotonic provider-side usage meter (mirrors sideband-protocol UsageMeter). */
export class UsageMeter {
  private _units = 0;
  private _seq = 0;

  constructor(
    readonly pricePerUnit: bigint,
    readonly maxUnits: number,
  ) {}

  get units() {
    return this._units;
  }
  get seq() {
    return this._seq;
  }
  /** Stroops owed for units metered so far. */
  get owed(): bigint {
    return this.pricePerUnit * BigInt(this._units);
  }

  /** Would recording [n] more units fit the cap? */
  canRecord(n: number): boolean {
    return Number.isSafeInteger(n) && n > 0 && this._units + n <= this.maxUnits;
  }

  record(n: number): number {
    if (!Number.isSafeInteger(n) || n <= 0)
      throw new MeterError('invalid_units', 'units must be positive');
    if (this._units + n > this.maxUnits) {
      throw new MeterError('unit_cap', `Session unit cap ${this.maxUnits} exceeded`);
    }
    this._units += n;
    this._seq += 1;
    return this._units;
  }

  /** Wire `meter_sample` body (matches sideband-protocol MeterSample). */
  sample(session: string) {
    const sampleHash = createHash('sha256')
      .update(canonicalJson({ session, seq: this._seq, cumulativeUnits: this._units }))
      .digest('hex');
    return { seq: this._seq, cumulativeUnits: this._units, sampleHash };
  }
}
