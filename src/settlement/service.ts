import {
  ChannelError,
  prepareSettlement,
  transition,
  type ChannelAdapter,
  type FinalityEvidence,
  type SettlementIntent,
  type VoucherStore,
} from '@sideband/channels';
import { GatewayError } from '../errors.js';

/**
 * Thrown by chain adapters when a submission outcome is unknown (timeout,
 * connection loss). The tx hash MUST be known before submission so the intent
 * can be reconciled by hash rather than blindly retried.
 */
export class SubmissionTimeoutError extends Error {
  constructor(
    readonly txHash: string,
    message = 'Submission outcome unknown',
  ) {
    super(message);
    this.name = 'SubmissionTimeoutError';
  }
}

const LOCKED = new Set(['SUBMITTED', 'RECONCILING', 'CONFIRMED']);

/**
 * Settlement PREPARATION and tracking for the provider. It never reports
 * CONFIRMED without finality evidence, and a synthetic test adapter can never
 * produce that evidence.
 */
export class SettlementService {
  private readonly intents = new Map<string, SettlementIntent>();
  private readonly byChannel = new Map<string, string>();

  constructor(
    private readonly adapter: ChannelAdapter,
    private readonly vouchers: VoucherStore,
  ) {}

  /** Once an intent is in flight, the settled amount is fixed. */
  isLocked(channelId: string): boolean {
    const id = this.byChannel.get(channelId);
    const i = id ? this.intents.get(id) : undefined;
    return i !== undefined && LOCKED.has(i.state);
  }

  get(channelId: string): SettlementIntent | undefined {
    const id = this.byChannel.get(channelId);
    return id ? this.intents.get(id) : undefined;
  }

  private save(i: SettlementIntent): SettlementIntent {
    this.intents.set(i.id, i);
    this.byChannel.set(i.channelId, i.id);
    return i;
  }

  /** Idempotent: same highest voucher => same intent id. */
  async prepare(channelId: string): Promise<SettlementIntent> {
    const existing = this.get(channelId);
    if (existing && LOCKED.has(existing.state)) return existing;
    const binding = await this.adapter.getBinding(channelId);
    if (!binding) throw new GatewayError('unknown_channel', 'Unknown channel');
    const highest = await this.vouchers.get(channelId);
    if (!highest) throw new GatewayError('bad_state', 'No accepted voucher to settle');
    try {
      const fresh = prepareSettlement(binding, highest);
      if (existing && existing.id === fresh.id) return existing;
      return this.save(fresh);
    } catch (e) {
      throw new GatewayError('channel_not_open', (e as Error).message);
    }
  }

  /** Authorizes and submits via the adapter; returns a stateful intent. */
  async submit(channelId: string): Promise<SettlementIntent> {
    let intent = await this.prepare(channelId);
    if (intent.state !== 'CREATED' && intent.state !== 'AUTHORIZED') return intent;
    intent = this.save(transition(intent, 'AUTHORIZED'));
    try {
      const receipt = await this.adapter.close(channelId, intent.voucher);
      return this.save(transition(intent, 'SUBMITTED', { txHash: receipt.txRef }));
    } catch (e) {
      if (e instanceof SubmissionTimeoutError) {
        const sub = transition(intent, 'SUBMITTED', { txHash: e.txHash });
        return this.save(transition(sub, 'RECONCILING'));
      }
      if (e instanceof ChannelError) {
        return this.save(transition(intent, 'FAILED', { failure: `${e.code}: ${e.message}` }));
      }
      throw e;
    }
  }

  /** Records finality evidence observed by a reconciler. */
  confirm(channelId: string, evidence: FinalityEvidence): SettlementIntent {
    const i = this.get(channelId);
    if (!i) throw new GatewayError('unknown_channel', 'No settlement intent');
    try {
      return this.save(transition(i, 'CONFIRMED', { evidence }));
    } catch (e) {
      throw new GatewayError('bad_state', (e as Error).message);
    }
  }
}
