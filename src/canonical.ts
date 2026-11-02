/**
 * Canonical JSON, identical rules to sideband-protocol's Dart `canonicalJson`:
 * keys sorted by UTF-16 code unit, no whitespace, only null/bool/int/string/
 * array/object. No floats: amounts are strings.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) throw new TypeError('Only safe integers allowed');
      return String(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const o = value as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Unsupported type in canonical JSON: ${typeof value}`);
  }
}
