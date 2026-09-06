import type { JsonValue, NormalizerName } from './types.js';

const CURRENCY_CODES: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  usd: 'USD',
  eur: 'EUR',
  gbp: 'GBP',
  jpy: 'JPY',
};

export function normalizeWhitespace(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function applyNormalizers(
  initial: string,
  transforms: NormalizerName[] = [],
): JsonValue {
  let value: JsonValue = initial;

  for (const transform of transforms) {
    switch (transform) {
      case 'trim': {
        assertString(value, transform);
        value = normalizeWhitespace(value);
        break;
      }
      case 'lowercase': {
        assertString(value, transform);
        value = normalizeWhitespace(value).toLocaleLowerCase('en-US');
        break;
      }
      case 'parse-number': {
        assertString(value, transform);
        const match = normalizeWhitespace(value).match(
          /[-+]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?|[-+]?\d+(?:[.,]\d+)?/u,
        );
        if (!match) throw new TypeError('No number was found.');
        value = parseLocalizedNumber(match[0]);
        break;
      }
      case 'currency-code': {
        assertString(value, transform);
        const normalized = normalizeWhitespace(value);
        const key = Object.keys(CURRENCY_CODES).find((candidate) =>
          normalized.toLocaleLowerCase('en-US').includes(candidate),
        );
        if (!key) throw new TypeError('No supported currency was found.');
        value = CURRENCY_CODES[key]!;
        break;
      }
      case 'iso-date': {
        assertString(value, transform);
        const normalized = normalizeWhitespace(value);
        const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
        if (!match)
          throw new TypeError(
            'Dates must use the unambiguous YYYY-MM-DD format.',
          );
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (
          date.getUTCFullYear() !== year ||
          date.getUTCMonth() !== month - 1 ||
          date.getUTCDate() !== day
        ) {
          throw new TypeError('The value is not a valid calendar date.');
        }
        value = normalized;
        break;
      }
      case 'boolean': {
        assertString(value, transform);
        const normalized =
          normalizeWhitespace(value).toLocaleLowerCase('en-US');
        if (['true', 'yes', '1'].includes(normalized)) value = true;
        else if (['false', 'no', '0'].includes(normalized)) value = false;
        else throw new TypeError('The value is not an explicit boolean.');
        break;
      }
      case 'json-decode': {
        assertString(value, transform);
        const parsed: unknown = JSON.parse(value);
        if (!isJsonValue(parsed)) {
          throw new TypeError('The decoded value is not JSON-safe.');
        }
        value = parsed;
        break;
      }
      default: {
        transform satisfies never;
        throw new TypeError(`Unsupported normalizer: ${String(transform)}`);
      }
    }
  }

  return value;
}

function assertString(
  value: JsonValue,
  transform: string,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${transform} expects a string input.`);
  }
}

function parseLocalizedNumber(raw: string): number {
  const compact = raw.replace(/\s/gu, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const otherSeparator = decimalSeparator === ',' ? '.' : ',';
  const parts = compact.split(decimalSeparator);
  let normalized: string;

  if (parts.length === 2 && parts[1]!.length !== 3) {
    normalized = `${parts[0]!.replaceAll(otherSeparator, '')}.${parts[1]}`;
  } else {
    normalized = compact.replace(/[.,]/gu, '');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value))
    throw new TypeError('The parsed number is not finite.');
  return value;
}

export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 64) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number')
    return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) return false;
    return value.every((item) => isJsonValue(item, depth + 1));
  }
  if (typeof value !== 'object') return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(
    ([key, item]) =>
      !['__proto__', 'prototype', 'constructor'].includes(key) &&
      isJsonValue(item, depth + 1),
  );
}
