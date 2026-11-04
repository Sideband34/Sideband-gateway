import { randomUUID } from 'node:crypto';
import {
  NETWORK_PASSPHRASES,
  acceptVoucher,
  formatAmount,
  type ChannelAdapter,
  type ChannelBinding,
  type SettlementIntent,
  type Voucher,
  type VoucherStore,
} from '@sideband/channels';
import type { GatewayConfig } from './config.js';
import { GatewayError } from './errors.js';
import { signManifest, type ManifestSigner, type SignedManifest } from './auth/manifest.js';
import { UsageMeter, MeterError } from './metering/meter.js';
import type { NonceStore } from './replay/nonces.js';
import { runDemo, countWords, MAX_INPUT_CHARS } from './services/demo.js';
import { SettlementService, type SettlementKind } from './settlement/service.js';

export interface GatewayDeps {
  config: GatewayConfig;
  signer: ManifestSigner;
  adapter: ChannelAdapter;
  vouchers: VoucherStore;
  nonces: NonceStore;
  settlement: SettlementService;
  /** Unix seconds. */
  now: () => number;
  newId?: () => string;
  /** If set, only these payer commitment keys may open sessions. */
  allowedPayers?: ReadonlySet<string>;
  /** Durable session/meter state. Defaults to memory (lost on restart). */
  sessions?: SessionStore;
}

type Phase = 'offered' | 'active' | 'closed';

/** Serializable session snapshot persisted after every mutation. */
export interface SessionRecord {
  id: string;
  phase: Phase;
  closeReason?: string;
  offerExpiresAt: number;
  channelRef?: string;
  maxSpend?: string; // stroops
  /** Channel cumulative at session start (protocol v2), stroops. */
  baseline?: string;
  /** Highest voucher accepted in this session, stroops. */
  highest?: string;
  units: number;
  seq: number;
}

export interface SessionStore {
  save(rec: SessionRecord): void;
  loadAll(): SessionRecord[];
}

export class InMemorySessionStore implements SessionStore {
  private readonly m = new Map<string, SessionRecord>();
  save(rec: SessionRecord) {
    this.m.set(rec.id, { ...rec });
  }
  loadAll() {
    return [...this.m.values()];
  }
}

interface Session {
  id: string;
  phase: Phase;
  closeReason?: string;
  offerExpiresAt: number;
  meter: UsageMeter;
  channelRef?: string;
  maxSpend?: bigint;
  baseline?: bigint;
  highest?: bigint;
  binding?: ChannelBinding;
}

/** Wire shapes match sideband-protocol frames (v1). */
export interface ServiceOfferWire {
  type: 'service_offer';
  v: 1;
  session: string;
  serviceId: string;
  providerPublicKey: string;
  pricePerUnit: string;
  unit: string;
  currency: string;
  network: string;
  maxSessionUnits: number;
  expiresAt: number;
}

export interface AcceptInput {
  session: string;
  channelRef: string;
  /** Budget for this session, on top of `baseline`. */
  maxSpend: bigint;
  nonce: string;
  /**
   * Channel cumulative the payer believes is already committed (protocol v2
   * `session_accept.baseline`; absent/0 for a v1 accept on a fresh channel).
   * Must equal the provider's highest accepted voucher for the channel.
   */
  baseline?: bigint;
}

export class ProviderGateway {
  private readonly sessions = new Map<string, Session>();
  private readonly activeChannels = new Map<string, string>(); // channel -> session
  private readonly locks = new Map<string, Promise<unknown>>();
  private shuttingDown = false;

  private readonly store: SessionStore;

  constructor(private readonly d: GatewayDeps) {
    this.store = d.sessions ?? new InMemorySessionStore();
  }

  private persist(s: Session) {
    this.store.save({
      id: s.id,
      phase: s.phase,
      ...(s.closeReason ? { closeReason: s.closeReason } : {}),
      offerExpiresAt: s.offerExpiresAt,
      ...(s.channelRef ? { channelRef: s.channelRef } : {}),
      ...(s.maxSpend !== undefined ? { maxSpend: s.maxSpend.toString() } : {}),
      ...(s.baseline !== undefined ? { baseline: s.baseline.toString() } : {}),
      ...(s.highest !== undefined ? { highest: s.highest.toString() } : {}),
      units: s.meter.units,
      seq: s.meter.seq,
    });
  }

  /**
   * Reloads persisted sessions after a restart. Active sessions re-bind their
   * channel from the adapter (the chain/cache is the source of truth); a
   * session whose channel can no longer be bound is closed, never resumed blind.
   */
  async restore(): Promise<{ restored: number; closed: number }> {
    let restored = 0;
    let closed = 0;
    const c = this.d.config;
    for (const r of this.store.loadAll()) {
      const meter = new UsageMeter(c.pricePerUnitStroops, c.maxSessionUnits);
      meter.restore(r.units, r.seq);
      const s: Session = {
        id: r.id,
        phase: r.phase,
        offerExpiresAt: r.offerExpiresAt,
        meter,
        ...(r.closeReason ? { closeReason: r.closeReason } : {}),
        ...(r.channelRef ? { channelRef: r.channelRef } : {}),
        ...(r.maxSpend !== undefined ? { maxSpend: BigInt(r.maxSpend) } : {}),
        ...(r.baseline !== undefined ? { baseline: BigInt(r.baseline) } : {}),
        ...(r.highest !== undefined ? { highest: BigInt(r.highest) } : {}),
      };
      this.sessions.set(s.id, s);
      restored++;
      if (s.phase !== 'active' || !s.channelRef) continue;
      const b = await this.d.adapter.getBinding(s.channelRef);
      if (b && b.status === 'open' && b.expiresAt > this.d.now()) {
        s.binding = b;
        this.activeChannels.set(b.channelId, s.id);
      } else {
        this.closeSession(s.id, 'restore_channel_unavailable');
        closed++;
      }
    }
    return { restored, closed };
  }

  get isShuttingDown() {
    return this.shuttingDown;
  }

  private get passphrase() {
    return NETWORK_PASSPHRASES[this.d.config.network];
  }

  private session(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new GatewayError('unknown_session', 'Unknown session');
    return s;
  }

  private async locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(
      id,
      run.catch(() => undefined),
    );
    return run;
  }

  manifest(): SignedManifest {
    const c = this.d.config;
    const now = this.d.now();
    return signManifest(this.d.signer, {
      schemaVersion: 1,
      serviceId: c.serviceId,
      providerPublicKey: this.d.signer.publicKey,
      network: c.network,
      pricePerUnit: formatAmount(c.pricePerUnitStroops),
      unit: c.unit,
      currency: c.currency,
      maxSessionUnits: c.maxSessionUnits,
      issuedAt: now,
      expiresAt: now + c.manifestTtlSec,
    });
  }

  createOffer(): ServiceOfferWire {
    if (this.shuttingDown) throw new GatewayError('shutting_down', 'Provider is shutting down');
    const c = this.d.config;
    const id = (this.d.newId ?? randomUUID)();
    const expiresAt = this.d.now() + c.offerTtlSec;
    this.sessions.set(id, {
      id,
      phase: 'offered',
      offerExpiresAt: expiresAt,
      meter: new UsageMeter(c.pricePerUnitStroops, c.maxSessionUnits),
    });
    this.persist(this.sessions.get(id) as Session);
    return {
      type: 'service_offer',
      v: 1,
      session: id,
      serviceId: c.serviceId,
      providerPublicKey: this.d.signer.publicKey,
      pricePerUnit: formatAmount(c.pricePerUnitStroops),
      unit: c.unit,
      currency: c.currency,
      network: c.network,
      maxSessionUnits: c.maxSessionUnits,
      expiresAt,
    };
  }

  async acceptSession(a: AcceptInput): Promise<{ session: string; phase: Phase }> {
    if (this.shuttingDown) throw new GatewayError('shutting_down', 'Provider is shutting down');
    const s = this.session(a.session);
    if (s.phase !== 'offered') throw new GatewayError('bad_state', `Session is ${s.phase}`);
    if (s.offerExpiresAt <= this.d.now()) throw new GatewayError('offer_expired', 'Offer expired');

    // Cached funded-channel binding, established online before the session.
    const b = await this.d.adapter.getBinding(a.channelRef);
    if (!b) throw new GatewayError('no_funded_channel', 'Channel not funded/bound');
    if (b.networkPassphrase !== this.passphrase) {
      throw new GatewayError('wrong_network', 'Channel is on another network');
    }
    if (b.provider !== this.d.signer.publicKey) {
      throw new GatewayError('wrong_provider', 'Channel is bound to another provider');
    }
    if (this.d.allowedPayers && !this.d.allowedPayers.has(b.payer)) {
      throw new GatewayError('unauthorized_payer', 'Payer key not authorized');
    }
    if (b.status === 'closing') {
      throw new GatewayError('channel_closing', 'Payer started closing this channel');
    }
    if (b.status !== 'open') throw new GatewayError('channel_not_open', `Channel is ${b.status}`);
    if (b.expiresAt <= this.d.now()) throw new GatewayError('channel_expired', 'Channel expired');
    if (this.d.settlement.isLocked(b.channelId)) {
      throw new GatewayError('channel_settling', 'Channel settlement in progress');
    }
    const holder = this.activeChannels.get(b.channelId);
    if (holder && holder !== s.id && this.sessions.get(holder)?.phase === 'active') {
      throw new GatewayError('channel_in_use', 'Channel already has an active session');
    }
    // Voucher amounts are cumulative per CHANNEL. Sequential sessions share a
    // channel by agreeing on the baseline (protocol v2): the payer's baseline
    // must equal our highest accepted voucher, otherwise earlier commitments
    // would pay for new usage (lower) or the payer would pay twice (higher).
    const committed = (await this.d.vouchers.get(b.channelId))?.cumulative ?? 0n;
    const baseline = a.baseline ?? 0n;
    if (baseline !== committed) {
      throw new GatewayError(
        'baseline_mismatch',
        'Session baseline must equal the channel cumulative already committed',
        { expectedBaseline: formatAmount(committed) },
      );
    }
    const cap = s.meter.pricePerUnit * BigInt(s.meter.maxUnits);
    if (a.maxSpend > cap) throw new GatewayError('spend_exceeds_offer', 'maxSpend above offer cap');
    if (baseline + a.maxSpend > b.deposit) {
      throw new GatewayError('spend_exceeds_deposit', 'baseline + maxSpend above channel deposit');
    }
    if (!this.d.nonces.consume(a.nonce)) {
      throw new GatewayError('replayed_nonce', 'Nonce already used');
    }
    s.phase = 'active';
    s.channelRef = b.channelId;
    s.maxSpend = a.maxSpend;
    s.baseline = baseline;
    s.binding = b;
    this.activeChannels.set(b.channelId, s.id);
    this.persist(s);
    return { session: s.id, phase: s.phase };
  }

  /** Verifies a voucher and atomically advances the highest cumulative amount. */
  async submitVoucher(
    sessionId: string,
    v: Voucher,
  ): Promise<{ cumulative: bigint; delta: bigint; status: 'COMMITMENT_ACCEPTED_NOT_SETTLED' }> {
    const s = this.session(sessionId);
    if (s.phase !== 'active' || !s.binding || s.maxSpend === undefined) {
      throw new GatewayError('bad_state', `Session is ${s.phase}`);
    }
    if (v.channelRef !== s.channelRef) {
      throw new GatewayError('wrong_channel', 'Voucher for another channel');
    }
    if (this.d.settlement.isLocked(s.binding.channelId)) {
      throw new GatewayError('channel_settling', 'Channel settlement in progress');
    }
    const r = await acceptVoucher(
      {
        networkPassphrase: s.binding.networkPassphrase,
        channelId: s.binding.channelId,
        payer: s.binding.payer,
        provider: s.binding.provider,
      },
      {
        deposit: s.binding.deposit,
        maxSpend: s.maxSpend,
        baseline: s.baseline ?? 0n,
        expiresAt: s.binding.expiresAt,
        now: this.d.now,
      },
      this.d.vouchers,
      v,
    );
    if (!r.ok) throw new GatewayError(r.code, r.detail);
    s.highest = r.cumulative;
    this.persist(s);
    return { cumulative: r.cumulative, delta: r.delta, status: 'COMMITMENT_ACCEPTED_NOT_SETTLED' };
  }

  /** Metered demo call. Refuses work not covered by vouchers (+ allowance). */
  serve(sessionId: string, text: string) {
    return this.locked(sessionId, async () => {
      if (this.shuttingDown) throw new GatewayError('shutting_down', 'Provider is shutting down');
      const s = this.session(sessionId);
      if (s.phase !== 'active' || !s.channelRef) {
        throw new GatewayError('bad_state', `Session is ${s.phase}`);
      }
      if (text.length > MAX_INPUT_CHARS)
        throw new GatewayError('invalid_request', 'input too large');
      const units = countWords(text);
      if (units === 0) throw new GatewayError('invalid_request', 'empty input');
      if (!s.meter.canRecord(units)) throw new GatewayError('unit_cap', 'Session unit cap reached');
      const newOwed = s.meter.owed + s.meter.pricePerUnit * BigInt(units);
      const covered = await this.sessionCommitted(s);
      if (newOwed > covered + this.d.config.creditAllowanceStroops) {
        // Wire amounts are CHANNEL cumulative (what the payer signs): the
        // session baseline plus this session's owed / committed value.
        const base = s.baseline ?? 0n;
        throw new GatewayError('payment_required', 'Voucher does not cover this request', {
          requiredCumulative: formatAmount(base + newOwed),
          currentCumulative: formatAmount(base + covered),
          sessionOwed: formatAmount(newOwed),
        });
      }
      const out = runDemo(text);
      try {
        s.meter.record(out.units);
      } catch (e) {
        if (e instanceof MeterError) throw new GatewayError('unit_cap', e.message);
        throw e;
      }
      this.persist(s);
      return {
        output: out.output,
        units: out.units,
        cumulativeUnits: s.meter.units,
        owed: formatAmount(s.meter.owed),
      };
    });
  }

  /** Payer reports its own meter count; provider reports any discrepancy. */
  reportMeter(sessionId: string, report: { seq: number; cumulativeUnits: number }) {
    const s = this.session(sessionId);
    if (s.phase !== 'active') throw new GatewayError('bad_state', `Session is ${s.phase}`);
    const sample = s.meter.sample(s.id);
    return {
      ...sample,
      payerCumulativeUnits: report.cumulativeUnits,
      discrepancyUnits: report.cumulativeUnits - sample.cumulativeUnits,
      match: report.cumulativeUnits === sample.cumulativeUnits,
    };
  }

  /**
   * Value committed by vouchers in THIS session: channel highest minus the
   * session baseline. Later sessions on the same channel are sequential, so
   * while this session is active the channel highest belongs to it.
   */
  private async sessionCommitted(s: Session): Promise<bigint> {
    if (!s.channelRef) return 0n;
    const highest = (await this.d.vouchers.get(s.channelRef))?.cumulative ?? 0n;
    const c = highest - (s.baseline ?? 0n);
    return c > 0n ? c : 0n;
  }

  async usage(sessionId: string) {
    const s = this.session(sessionId);
    const highest = s.channelRef
      ? ((await this.d.vouchers.get(s.channelRef))?.cumulative ?? 0n)
      : 0n;
    const baseline = s.baseline ?? 0n;
    // This session's own vouchers only (later sessions build on top).
    const mine = s.highest ?? (s.phase === 'active' ? highest : baseline);
    const committed = mine > baseline ? mine - baseline : 0n;
    const owed = s.meter.owed;
    return {
      session: s.id,
      phase: s.phase,
      ...(s.closeReason ? { closeReason: s.closeReason } : {}),
      units: s.meter.units,
      seq: s.meter.seq,
      owed: formatAmount(owed),
      baseline: formatAmount(baseline),
      sessionCommitted: formatAmount(committed),
      highestVoucher: formatAmount(highest),
      unpaid: formatAmount(owed > committed ? owed - committed : 0n),
      settlement: 'NOT_SETTLED' as const,
    };
  }

  closeSession(sessionId: string, reason = 'client_close') {
    const s = this.session(sessionId);
    if (s.phase === 'closed') return;
    s.phase = 'closed';
    s.closeReason = reason;
    if (s.channelRef && this.activeChannels.get(s.channelRef) === s.id) {
      this.activeChannels.delete(s.channelRef);
    }
    this.persist(s);
  }

  async channelStatus(channelId: string) {
    const binding = await this.d.adapter.getBinding(channelId);
    if (!binding) throw new GatewayError('unknown_channel', 'Unknown channel');
    const highest = (await this.d.vouchers.get(channelId))?.cumulative ?? 0n;
    const intent = this.d.settlement.get(channelId);
    return {
      channelId,
      onChainStatus: binding.status,
      deposit: formatAmount(binding.deposit),
      withdrawn: formatAmount(binding.withdrawn),
      highestVoucher: formatAmount(highest),
      unsettled: formatAmount(highest > binding.withdrawn ? highest - binding.withdrawn : 0n),
      ...(binding.closeEffectiveAt !== undefined
        ? { closeEffectiveAt: binding.closeEffectiveAt, disputeWindowOpen: true }
        : {}),
      settlement: intent
        ? {
            id: intent.id,
            kind: intent.kind,
            state: intent.state,
            // the operator needs the ledger hash and the reason a settlement failed (status is admin-only)
            ...(intent.txHash ? { txHash: intent.txHash } : {}),
            ...(intent.failure ? { failure: intent.failure } : {}),
          }
        : null,
    };
  }

  /**
   * Submits a settlement. `settle` (default, `config.settleMode`) withdraws
   * and keeps the channel open for further sessions; `close` is terminal.
   */
  async settle(channelId: string, kind?: SettlementKind): Promise<SettlementIntent> {
    return this.d.settlement.submit(channelId, kind ?? this.d.config.settleMode);
  }

  /**
   * Periodic job for long-running providers. For every channel this gateway
   * served: if the payer started closing, submit a `close` with the highest
   * voucher before the dispute window ends; otherwise `settle` once unsettled
   * value reaches `threshold`. Returns the intents it submitted.
   */
  async settleDue(threshold: bigint): Promise<SettlementIntent[]> {
    const channels = new Set<string>();
    for (const s of this.sessions.values()) if (s.channelRef) channels.add(s.channelRef);
    const out: SettlementIntent[] = [];
    for (const c of channels) {
      const b = await this.d.adapter.getBinding(c);
      const highest = (await this.d.vouchers.get(c))?.cumulative ?? 0n;
      if (!b || highest <= b.withdrawn) continue;
      if (b.status === 'closing') {
        out.push(await this.d.settlement.submit(c, 'close'));
      } else if (b.status === 'open' && highest - b.withdrawn >= threshold) {
        out.push(await this.d.settlement.submit(c, 'settle'));
      }
    }
    return out;
  }

  /**
   * Graceful provider shutdown: stop new work, close sessions, and prepare
   * (not submit) a settlement intent for every channel holding a voucher so no
   * accepted value is dropped. Returns the prepared intents.
   */
  async shutdown(): Promise<SettlementIntent[]> {
    this.shuttingDown = true;
    const channels = new Set<string>();
    for (const s of this.sessions.values()) {
      if (s.channelRef) channels.add(s.channelRef);
      this.closeSession(s.id, 'provider_shutdown');
    }
    const intents: SettlementIntent[] = [];
    for (const c of channels) {
      if (await this.d.vouchers.get(c)) {
        try {
          intents.push(await this.d.settlement.prepare(c, this.d.config.settleMode));
        } catch {
          /* channel no longer settleable; surfaced via channelStatus */
        }
      }
    }
    return intents;
  }
}
