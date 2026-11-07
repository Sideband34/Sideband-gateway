import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AmountError, formatAmount, parseAmount } from '@sideband/channels';
import { GatewayError } from '../errors.js';
import type { ProviderGateway } from '../gateway.js';
import { requireAdmin, requireSession, sessionToken } from './auth.js';
import { RateLimiter } from './ratelimit.js';

export interface HttpOptions {
  /** HMAC secret for session capability tokens. Required. */
  sessionSecret: Buffer;
  /** Static admin token; if absent the admin endpoints are disabled. */
  adminToken?: string;
  /** Defaults to 60 requests burst, 20/s refill per client address. */
  limiter?: RateLimiter;
  /** Receives unexpected (non-GatewayError) failures with their requestId. Defaults to console.error. The client only ever sees a generic message. */
  logError?: (line: string) => void;
}

export const SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 16 * 1024; // same bound as sideband-protocol frames

const str = z.string().min(1).max(2048);
const amountStr = z.string().refine((s) => {
  try {
    parseAmount(s);
    return true;
  } catch {
    return false;
  }
}, 'invalid amount');

const OfferBody = z.object({ schemaVersion: z.literal(1), requestId: str.optional() }).strict();
// v1: fresh channel. v2 (Sideband-protocol ADR 0001): carries `baseline`, the
// channel cumulative already committed, so sessions can reuse a channel.
const AcceptBody = z
  .object({
    type: z.literal('session_accept'),
    v: z.union([z.literal(1), z.literal(2)]),
    session: str,
    channelRef: str,
    maxSpend: amountStr,
    nonce: str,
    baseline: amountStr.optional(),
  })
  .strict()
  .refine((b) => (b.v === 1 ? b.baseline === undefined : b.baseline !== undefined), {
    message: 'baseline is required in v2 and not allowed in v1',
    path: ['baseline'],
  });
const SettleBody = z.object({ mode: z.enum(['settle', 'close']).optional() }).strict();
const VoucherBody = z
  .object({
    type: z.literal('voucher'),
    v: z.literal(1),
    session: str,
    channelRef: str,
    cumulativeAmount: amountStr,
    commitment: str,
    signature: str,
  })
  .strict();
const MeterBody = z
  .object({
    type: z.literal('meter_sample').optional(),
    v: z.literal(1).optional(),
    session: str.optional(),
    seq: z.number().int().nonnegative(),
    cumulativeUnits: z.number().int().nonnegative(),
    sampleHash: str.optional(),
  })
  .strict();
const ServeBody = z.object({ text: z.string().min(1).max(4000) }).strict();

class BadRequest extends GatewayError {
  constructor(message: string) {
    super('invalid_request', message);
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequest('Body too large');
    chunks.push(c as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BadRequest('Malformed JSON');
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequest(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

const intentJson = (i: {
  id: string;
  kind: string;
  state: string;
  channelId: string;
  amount: bigint;
  txHash?: string | undefined;
  failure?: string | undefined;
}) => ({
  intentId: i.id,
  kind: i.kind,
  state: i.state,
  channelId: i.channelId,
  amount: formatAmount(i.amount),
  ...(i.txHash ? { txHash: i.txHash } : {}),
  ...(i.failure ? { failure: i.failure } : {}),
});

export function createHttpServer(gw: ProviderGateway, opts: HttpOptions): Server {
  if (opts.sessionSecret.length < 16) throw new Error('sessionSecret must be at least 16 bytes');
  const limiter = opts.limiter ?? new RateLimiter(60, 20);
  return createServer(async (req, res) => {
    const requestId =
      typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].length <= 64
        ? req.headers['x-request-id']
        : randomUUID();
    res.setHeader('x-request-id', requestId);
    try {
      const rl = limiter.take(req.socket.remoteAddress ?? 'unknown');
      if (!rl.ok) {
        res.setHeader('retry-after', String(rl.retryAfterSec));
        throw new GatewayError('rate_limited', 'Too many requests');
      }
      const url = new URL(req.url ?? '/', 'http://local');
      const path = url.pathname;
      const method = req.method ?? 'GET';
      let m: RegExpExecArray | null;

      if (method === 'GET' && path === '/v1/health') {
        return send(res, 200, {
          status: gw.isShuttingDown ? 'shutting_down' : 'ok',
          schemaVersion: SCHEMA_VERSION,
          requestId,
        });
      }
      if (method === 'GET' && path === '/.well-known/sideband-service.json') {
        return send(res, 200, gw.manifest());
      }
      if (method === 'POST' && path === '/v1/sessions/offer') {
        parse(OfferBody, await readJson(req));
        const offer = gw.createOffer();
        res.setHeader('x-sideband-session-token', sessionToken(opts.sessionSecret, offer.session));
        return send(res, 201, offer);
      }
      if (method === 'POST' && path === '/v1/sessions/accept') {
        const b = parse(AcceptBody, await readJson(req));
        requireSession(opts.sessionSecret, b.session, req.headers.authorization);
        const r = await gw.acceptSession({
          session: b.session,
          channelRef: b.channelRef,
          maxSpend: parseAmount(b.maxSpend),
          nonce: b.nonce,
          ...(b.baseline !== undefined ? { baseline: parseAmount(b.baseline) } : {}),
        });
        return send(res, 200, { session: r.session, status: r.phase });
      }
      if ((m = /^\/v1\/sessions\/([^/]+)\/(meter|vouchers|serve|usage|close)$/.exec(path))) {
        const id = decodeURIComponent(m[1] as string);
        const action = m[2];
        requireSession(opts.sessionSecret, id, req.headers.authorization);
        if (method === 'POST' && action === 'meter') {
          const b = parse(MeterBody, await readJson(req));
          return send(res, 200, gw.reportMeter(id, b));
        }
        if (method === 'POST' && action === 'vouchers') {
          const b = parse(VoucherBody, await readJson(req));
          if (b.session !== id) throw new GatewayError('invalid_request', 'session mismatch');
          const r = await gw.submitVoucher(id, {
            channelRef: b.channelRef,
            cumulativeAmount: b.cumulativeAmount,
            commitment: b.commitment,
            signature: b.signature,
          });
          return send(res, 200, {
            status: r.status,
            cumulativeAmount: formatAmount(r.cumulative),
            delta: formatAmount(r.delta),
            note: 'A voucher is a signed commitment, not settled funds.',
          });
        }
        if (method === 'POST' && action === 'serve') {
          const b = parse(ServeBody, await readJson(req));
          return send(res, 200, await gw.serve(id, b.text));
        }
        if (method === 'POST' && action === 'close') {
          gw.closeSession(id);
          return send(res, 200, await gw.usage(id));
        }
        if (method === 'GET' && action === 'usage') return send(res, 200, await gw.usage(id));
      }
      if ((m = /^\/v1\/channels\/([^/]+)\/(settle|status)$/.exec(path))) {
        const id = decodeURIComponent(m[1] as string);
        requireAdmin(opts.adminToken, req.headers['x-admin-token']);
        if (method === 'POST' && m[2] === 'settle') {
          // Returns a stateful intent, never a fake immediate success.
          const b = parse(SettleBody, await readJson(req));
          return send(res, 202, intentJson(await gw.settle(id, b.mode)));
        }
        if (method === 'GET' && m[2] === 'status')
          return send(res, 200, await gw.channelStatus(id));
      }
      throw new GatewayError('invalid_request', 'Not found');
    } catch (e) {
      if (e instanceof GatewayError) {
        const notFound = e.message === 'Not found' && e.code === 'invalid_request';
        return send(res, notFound ? 404 : e.httpStatus, {
          error: { code: e.code, message: e.message, requestId, ...e.extra },
        });
      }
      if (e instanceof AmountError) {
        return send(res, 400, {
          error: { code: 'invalid_request', message: e.message, requestId },
        });
      }
      // Never leak internals to the client, but never swallow them either: the operator needs the cause.
      (opts.logError ?? console.error)(
        `unhandled error requestId=${requestId}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
      );
      send(res, 500, { error: { code: 'internal', message: 'Internal error', requestId } });
    }
  });
}
