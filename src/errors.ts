export type GatewayErrorCode =
  | 'invalid_request'
  | 'unknown_session'
  | 'unknown_channel'
  | 'bad_state'
  | 'shutting_down'
  | 'offer_expired'
  | 'no_funded_channel'
  | 'channel_not_open'
  | 'channel_expired'
  | 'channel_in_use'
  | 'channel_settling'
  | 'wrong_provider'
  | 'wrong_network'
  | 'wrong_channel'
  | 'unauthorized_payer'
  | 'replayed_nonce'
  | 'spend_exceeds_offer'
  | 'spend_exceeds_deposit'
  | 'payment_required'
  | 'unit_cap'
  // voucher verification / acceptance failures (from @sideband/channels)
  | 'malformed'
  | 'commitment_mismatch'
  | 'bad_signature'
  | 'replay'
  | 'non_monotonic'
  | 'over_deposit'
  | 'over_budget'
  | 'contention';

const STATUS: Partial<Record<GatewayErrorCode, number>> = {
  unknown_session: 404,
  unknown_channel: 404,
  payment_required: 402,
  shutting_down: 503,
  contention: 503,
  bad_signature: 401,
  unauthorized_payer: 403,
};

export class GatewayError extends Error {
  readonly httpStatus: number;
  constructor(
    readonly code: GatewayErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'GatewayError';
    this.httpStatus = STATUS[code] ?? (code === 'invalid_request' ? 400 : 409);
  }
}
