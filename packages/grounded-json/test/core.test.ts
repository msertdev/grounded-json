import { describe, expect, it } from 'vitest';

import {
  applyNormalizers,
  canonicalJson,
  isJsonValue,
  listLeafPointers,
  parsePointer,
  setAtPointer,
} from '../src/index.js';
import type { JsonValue } from '../src/index.js';

describe('canonical JSON and pointers', () => {
  it('sorts object keys without changing arrays', () => {
    expect(canonicalJson({ z: 1, a: [2, 1] })).toBe('{"a":[2,1],"z":1}');
  });

  it('rejects negative zero and sparse arrays', () => {
    expect(() => canonicalJson(-0)).toThrow(/negative zero/u);
    const sparse: JsonValue[] = [];
    sparse.length = 2;
    sparse[1] = 'present';
    expect(isJsonValue(sparse)).toBe(false);
  });

  it('supports escaped pointer keys and rejects unsafe segments', () => {
    expect(parsePointer('/a~1b/~0key')).toEqual(['a/b', '~key']);
    expect(() => parsePointer('/bad~2escape')).toThrow(
      /Invalid JSON Pointer escape/u,
    );
    expect(() => parsePointer('/__proto__/polluted')).toThrow(/Unsafe/u);
  });

  it('counts null and empty containers as terminal values', () => {
    expect(listLeafPointers({ nil: null, list: [], object: {} })).toEqual([
      '/nil',
      '/list',
      '/object',
    ]);
  });

  it('prevents sparse array construction', () => {
    const value = Object.create(null) as Record<string, JsonValue>;
    expect(() => setAtPointer(value, '/items/2/name', 'unsafe')).toThrow(
      /Sparse/u,
    );
  });
});

describe('deterministic normalizers', () => {
  it('parses localized numbers and currencies', () => {
    expect(applyNormalizers('€ 1.299,50', ['parse-number'])).toBe(1299.5);
    expect(applyNormalizers('€ 1.299,50', ['currency-code'])).toBe('EUR');
  });

  it('keeps type comparison explicit', () => {
    expect(applyNormalizers('true', ['boolean'])).toBe(true);
    expect(applyNormalizers('null', ['json-decode'])).toBe(null);
  });

  it('accepts only real, unambiguous ISO calendar dates', () => {
    expect(applyNormalizers('2026-02-28', ['iso-date'])).toBe('2026-02-28');
    expect(() => applyNormalizers('2026-02-31', ['iso-date'])).toThrow(
      /valid calendar date/u,
    );
    expect(() => applyNormalizers('03/04/2026', ['iso-date'])).toThrow(
      /YYYY-MM-DD/u,
    );
  });

  it('fails closed on an unknown runtime transform', () => {
    expect(() => applyNormalizers('value', ['surprise'] as never)).toThrow(
      /Unsupported normalizer/u,
    );
  });
});
