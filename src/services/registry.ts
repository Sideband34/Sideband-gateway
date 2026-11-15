import { demoTextWordsService } from './demo.js';
import { demoDigestKbService } from './digest.js';
import type { MeteredService } from './types.js';

export const DEFAULT_SERVICE_ID = demoTextWordsService.id;

export const BUILT_IN_SERVICES: ReadonlyMap<string, MeteredService> = new Map<
  string,
  MeteredService
>([
  [demoTextWordsService.id, demoTextWordsService],
  [demoDigestKbService.id, demoDigestKbService],
]);

export function resolveService(serviceId: string = DEFAULT_SERVICE_ID): MeteredService {
  const svc = BUILT_IN_SERVICES.get(serviceId);
  if (!svc) {
    const known = [...BUILT_IN_SERVICES.keys()].join(', ');
    throw new RangeError(`Unknown SERVICE_ID "${serviceId}" (available: ${known})`);
  }
  return svc;
}
