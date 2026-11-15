export interface ServiceRequest {
  readonly text: string;
}

export interface ServiceResponse {
  readonly output: string;
  readonly units: number;
}

export class InvalidServiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidServiceInputError';
  }
}

/**
 * Metered service hosted by the provider gateway.
 *
 * Every service exposes its canonical `id`, billing `unit`, default `price`
 * (7-decimal string), and `handle(request)`. Services may also implement
 * `measure(request)` so invalid or unpaid requests are rejected before work runs.
 */
export interface MeteredService {
  readonly id: string;
  readonly unit: string;
  readonly price: string;
  measure?(request: ServiceRequest): number;
  handle(request: ServiceRequest): Promise<ServiceResponse> | ServiceResponse;
}
