import { createHmac, timingSafeEqual } from 'node:crypto';
import { GatewayError } from '../errors.js';

/**
 * Session capability tokens: HMAC-SHA256(secret, sessionId). Stateless, so they
 * survive restarts when the same secret is configured. A token only grants
 * access to its own session.
 */
export function sessionToken(secret: Buffer, sessionId: string): string {
  return createHmac('sha256', secret).update(`sideband-session:${sessionId}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function bearer(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{8,256})$/.exec(header);
  return m ? m[1] : undefined;
}

export function requireSession(
  secret: Buffer,
  sessionId: string,
  header: string | string[] | undefined,
) {
  const t = bearer(header);
  if (!t || !safeEqual(t, sessionToken(secret, sessionId))) {
    throw new GatewayError('unauthorized', 'Missing or invalid session token');
  }
}

/** Fails closed: with no ADMIN_TOKEN configured, admin endpoints are disabled. */
export function requireAdmin(
  adminToken: string | undefined,
  header: string | string[] | undefined,
) {
  if (!adminToken) throw new GatewayError('forbidden', 'Admin API disabled');
  const t = typeof header === 'string' ? header : undefined;
  if (!t || !safeEqual(t, adminToken))
    throw new GatewayError('unauthorized', 'Invalid admin token');
}
