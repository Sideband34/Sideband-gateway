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
import { SettlementService } from './settlement/service.js';

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
  maxSpend: bigint;
  nonce: string;
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
    if (b.status !== 'open') throw new GatewayError('channel_not_open', `Channel is ${b.status}`);
    if (b.expiresAt <= this.d.now()) throw new GatewayError('channel_expired', 'Channel expired');
    if (this.d.settlement.isLocked(b.channelId)) {
      throw new GatewayError('channel_settling', 'Channel settlement in progress');
    }
    const holder = this.activeChannels.get(b.channelId);
    if (holder && holder !== s.id && this.sessions.get(holder)?.phase === 'active') {
      throw new GatewayError('channel_in_use', 'Channel already has an active session');
    }
    const cap = s.meter.pricePerUnit * BigInt(s.meter.maxUnits);
    if (a.maxSpend > cap) throw new GatewayError('spend_exceeds_offer', 'maxSpend above offer cap');
    if (a.maxSpend > b.deposit) {
      throw new GatewayError('spend_exceeds_deposit', 'maxSpend above channel deposit');
    }
    if (!this.d.nonces.consume(a.nonce)) {
      throw new GatewayError('replayed_nonce', 'Nonce already used');
    }
    s.phase = 'active';
    s.channelRef = b.channelId;
    s.maxSpend = a.maxSpend;
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
        expiresAt: s.binding.expiresAt,
        now: this.d.now,
      },
      this.d.vouchers,
      v,
    );
    if (!r.ok) throw new GatewayError(r.code, r.detail);
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
      const covered = (await this.d.vouchers.get(s.channelRef))?.cumulative ?? 0n;
      if (newOwed > covered + this.d.config.creditAllowanceStroops) {
        throw new GatewayError('payment_required', 'Voucher does not cover this request', {
          requiredCumulative: formatAmount(newOwed),
          currentCumulative: formatAmount(covered),
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

  async usage(sessionId: string) {
    const s = this.session(sessionId);
    const highest = s.channelRef
      ? ((await this.d.vouchers.get(s.channelRef))?.cumulative ?? 0n)
      : 0n;
    const owed = s.meter.owed;
    return {
      session: s.id,
      phase: s.phase,
      ...(s.closeReason ? { closeReason: s.closeReason } : {}),
      units: s.meter.units,
      seq: s.meter.seq,
      owed: formatAmount(owed),
      highestVoucher: formatAmount(highest),
      unpaid: formatAmount(owed > highest ? owed - highest : 0n),
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
    const highest = await this.d.vouchers.get(channelId);
    const intent = this.d.settlement.get(channelId);
    return {
      channelId,
      onChainStatus: binding.status,
      highestVoucher: formatAmount(highest?.cumulative ?? 0n),
      settlement: intent ? { id: intent.id, state: intent.state } : null,
    };
  }

  async settle(channelId: string): Promise<SettlementIntent> {
    return this.d.settlement.submit(channelId);
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
          intents.push(await this.d.settlement.prepare(c));
        } catch {
          /* channel no longer settleable; surfaced via channelStatus */
        }
      }
    }
    return intents;
  }
}
