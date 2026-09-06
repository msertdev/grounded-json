import { createHash } from 'node:crypto';

import type { JsonValue } from './types.js';

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== 'object') {
    if (
      typeof value === 'number' &&
      (!Number.isFinite(value) || Object.is(value, -0))
    ) {
      throw new TypeError(
        'JSON values must use finite numbers and may not use negative zero.',
      );
    }
    return value;
  }

  const sorted: Record<string, JsonValue> = Object.create(null) as Record<
    string,
    JsonValue
  >;
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJson(value[key]!);
  }
  return sorted;
}

export function sha256(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function jsonClone<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}
