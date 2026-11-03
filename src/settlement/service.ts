import {
  ChannelError,
  IntentError,
  prepareSettlement,
  transition,
  type ChannelAdapter,
  type FinalityEvidence,
  type SettlementIntent,
  type SettlementKind,
  SubmissionTimeoutError,
  type VoucherStore,
} from '@sideband/channels';
import { GatewayError } from '../errors.js';

export { SubmissionTimeoutError };
export type { SettlementKind };

const IN_FLIGHT = new Set(['SUBMITTED', 'RECONCILING']);
const LOCKED = new Set(['SUBMITTED', 'RECONCILING', 'CONFIRMED']);

/**
 * Settlement PREPARATION and tracking for the provider. It never reports
 * CONFIRMED without finality evidence, and a synthetic test adapter can never
 * produce that evidence.
 *
 * Two kinds (Sideband-channels ADR 0002):
 * - `settle` withdraws up to the highest voucher and keeps the channel open, so
 *   a long-running provider is paid while further sessions continue on the
 *   same channel. One settle is in flight per channel at a time; once it is
 *   CONFIRMED a later, higher voucher gets a new intent.
 * - `close` withdraws and refunds the rest. While a close is in flight or done
 *   the channel is locked: no new sessions or vouchers.
 */
export class SettlementService {
  private readonly intents = new Map<string, SettlementIntent>();
  private readonly byChannel = new Map<string, string>();

  constructor(
    private readonly adapter: ChannelAdapter,
    private readonly vouchers: VoucherStore,
  ) {}

  /** Once a close is in flight, the settled amount is fixed and the channel is done. */
  isLocked(channelId: string): boolean {
    const i = this.get(channelId);
    return i !== undefined && i.kind === 'close' && LOCKED.has(i.state);
  }

  /** Latest intent for the channel. */
  get(channelId: string): SettlementIntent | undefined {
    const id = this.byChannel.get(channelId);
    return id ? this.intents.get(id) : undefined;
  }

  private save(i: SettlementIntent): SettlementIntent {
    this.intents.set(i.id, i);
    this.byChannel.set(i.channelId, i.id);
    return i;
  }

  /** Idempotent: same (kind, highest voucher) => same intent id. */
  async prepare(channelId: string, kind: SettlementKind = 'close'): Promise<SettlementIntent> {
    const existing = this.get(channelId);
    if (existing && existing.kind === 'close' && LOCKED.has(existing.state)) return existing;
    const binding = await this.adapter.getBinding(channelId);
    if (!binding) throw new GatewayError('unknown_channel', 'Unknown channel');
    // One submission per channel at a time; reconcile it before the next one,
    // unless the chain view already shows that settle applied.
    if (
      existing &&
      IN_FLIGHT.has(existing.state) &&
      !(existing.kind === 'settle' && binding.withdrawn >= existing.amount)
    ) {
      return existing;
    }
    const highest = await this.vouchers.get(channelId);
    if (!highest) throw new GatewayError('bad_state', 'No accepted voucher to settle');
    try {
      const fresh = prepareSettlement(binding, highest, kind);
      if (existing && existing.id === fresh.id) return existing;
      return this.save(fresh);
    } catch (e) {
      if (e instanceof IntentError && /Nothing to settle/.test(e.message)) {
        throw new GatewayError('nothing_to_settle', e.message);
      }
      throw new GatewayError('channel_not_open', (e as Error).message);
    }
  }

  /** Authorizes and submits via the adapter; returns a stateful intent. */
  async submit(channelId: string, kind: SettlementKind = 'close'): Promise<SettlementIntent> {
    let intent = await this.prepare(channelId, kind);
    if (intent.state !== 'CREATED' && intent.state !== 'AUTHORIZED') return intent;
    intent = this.save(transition(intent, 'AUTHORIZED'));
    try {
      let receipt;
      if (intent.kind === 'settle') {
        receipt = await this.adapter.settle(channelId, intent.voucher);
      } else {
        // Everything up to the voucher was already withdrawn by `settle`:
        // close without re-presenting it (the contract would call it stale).
        const b = await this.adapter.getBinding(channelId);
        const already = b !== undefined && b.withdrawn >= intent.amount;
        receipt = await this.adapter.close(channelId, already ? undefined : intent.voucher);
      }
      const submitted = this.save(transition(intent, 'SUBMITTED', { txHash: receipt.txRef }));
      // Only a real chain adapter reports the ledger the tx was applied in;
      // synthetic test receipts can never reach CONFIRMED this way.
      if (!receipt.synthetic && receipt.ledger !== undefined) {
        return this.save(
          transition(submitted, 'CONFIRMED', {
            evidence: { network: intent.network, txHash: receipt.txRef, ledger: receipt.ledger },
          }),
        );
      }
      return submitted;
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

  /**
   * Resolves a RECONCILING intent by looking the tx hash up on the chain.
   * NOT_FOUND (or no lookup support) leaves it RECONCILING: unknown is not failed.
   */
  async reconcile(channelId: string): Promise<SettlementIntent> {
    const i = this.get(channelId);
    if (!i) throw new GatewayError('unknown_channel', 'No settlement intent');
    if (i.state !== 'RECONCILING' || !i.txHash || !this.adapter.findTransaction) return i;
    const found = await this.adapter.findTransaction(i.txHash);
    if (found.status === 'SUCCESS' && found.ledger !== undefined) {
      return this.save(
        transition(i, 'CONFIRMED', {
          evidence: { network: i.network, txHash: i.txHash, ledger: found.ledger },
        }),
      );
    }
    if (found.status === 'FAILED') {
      return this.save(transition(i, 'FAILED', { failure: 'transaction failed on-chain' }));
    }
    return i;
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
