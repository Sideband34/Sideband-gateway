/**
 * Metered demo service: upper-cases text. Billed per word.
 * Synthetic: exists only to exercise metering and vouchers.
 */
export const MAX_INPUT_CHARS = 2000;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function runDemo(text: string): { output: string; units: number } {
  if (text.length > MAX_INPUT_CHARS) throw new RangeError('input too large');
  return { output: text.toUpperCase(), units: countWords(text) };
}
