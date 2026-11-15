import { InvalidServiceInputError, type MeteredService, type ServiceRequest } from './types.js';

/**
 * Metered demo service: upper-cases text. Billed per word.
 * Synthetic: exists only to exercise metering and vouchers.
 */
export const MAX_INPUT_CHARS = 2000;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function measureDemoWords(request: ServiceRequest): number {
  if (request.text.length > MAX_INPUT_CHARS) {
    throw new InvalidServiceInputError('input too large');
  }
  const units = countWords(request.text);
  if (units === 0) {
    throw new InvalidServiceInputError('empty input');
  }
  return units;
}

export function runDemo(text: string): { output: string; units: number } {
  if (text.length > MAX_INPUT_CHARS) throw new RangeError('input too large');
  return { output: text.toUpperCase(), units: countWords(text) };
}

export const demoTextWordsService: MeteredService = {
  id: 'demo-text-words',
  unit: 'word',
  price: '0.001',
  measure: measureDemoWords,
  handle: (request) => {
    const units = measureDemoWords(request);
    return { output: request.text.toUpperCase(), units };
  },
};
