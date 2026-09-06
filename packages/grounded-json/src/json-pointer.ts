import type { JsonValue } from './types.js';

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function unescapePointerSegment(segment: string): string {
  if (/~(?:[^01]|$)/u.test(segment)) {
    throw new TypeError(`Invalid JSON Pointer escape in segment: ${segment}`);
  }
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

export function parsePointer(pointer: string): string[] {
  if (pointer.length > 4_096) {
    throw new TypeError('JSON Pointer exceeds the 4096-character limit.');
  }
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new TypeError(`Invalid JSON Pointer: ${pointer}`);
  }

  const segments = pointer.slice(1).split('/').map(unescapePointerSegment);
  if (segments.length > 256) {
    throw new TypeError('JSON Pointer exceeds the 256-segment limit.');
  }
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      throw new TypeError(`Unsafe JSON Pointer segment: ${segment}`);
    }
  }
  return segments;
}

export function getAtPointer(
  value: JsonValue,
  pointer: string,
): { found: boolean; value?: JsonValue } {
  let current: JsonValue = value;

  for (const segment of parsePointer(pointer)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index]!;
      continue;
    }

    if (current === null || typeof current !== 'object') {
      return { found: false };
    }

    if (!Object.hasOwn(current, segment)) return { found: false };
    current = current[segment]!;
  }

  return { found: true, value: current };
}

export function setAtPointer(
  root: Record<string, JsonValue>,
  pointer: string,
  value: JsonValue,
): void {
  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new TypeError('The root pointer cannot be assigned by setAtPointer.');
  }

  let current: Record<string, JsonValue> | JsonValue[] = root;
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    if (last) {
      if (Array.isArray(current)) {
        const arrayIndex = Number(segment);
        if (
          !Number.isSafeInteger(arrayIndex) ||
          arrayIndex < 0 ||
          arrayIndex > 10_000
        ) {
          throw new TypeError(`Invalid array index in pointer: ${segment}`);
        }
        if (arrayIndex > current.length) {
          throw new TypeError(
            `Sparse array assignment is not allowed: ${segment}`,
          );
        }
        current[arrayIndex] = value;
      } else {
        current[segment] = value;
      }
      return;
    }

    const nextSegment = segments[index + 1]!;
    const wantsArray = /^(0|[1-9]\d*)$/.test(nextSegment);
    let next: JsonValue | undefined;

    if (Array.isArray(current)) {
      const arrayIndex = Number(segment);
      if (
        !Number.isSafeInteger(arrayIndex) ||
        arrayIndex < 0 ||
        arrayIndex > 10_000
      ) {
        throw new TypeError(`Invalid array index in pointer: ${segment}`);
      }
      if (arrayIndex > current.length) {
        throw new TypeError(
          `Sparse array traversal is not allowed: ${segment}`,
        );
      }
      next = current[arrayIndex];
      if (next === undefined || next === null || typeof next !== 'object') {
        next = wantsArray
          ? []
          : (Object.create(null) as Record<string, JsonValue>);
        current[arrayIndex] = next;
      }
    } else {
      next = current[segment];
      if (next === undefined || next === null || typeof next !== 'object') {
        next = wantsArray
          ? []
          : (Object.create(null) as Record<string, JsonValue>);
        current[segment] = next;
      }
    }
    current = next as Record<string, JsonValue> | JsonValue[];
  }
}

export function listLeafPointers(value: JsonValue, pointer = ''): string[] {
  if (value === null) return [pointer];
  if (typeof value !== 'object') return [pointer];

  if (Array.isArray(value)) {
    if (value.length === 0) return [pointer];
    return value.flatMap((item, index) =>
      listLeafPointers(item, `${pointer}/${index}`),
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return [pointer];
  return entries.flatMap(([key, item]) =>
    listLeafPointers(item, `${pointer}/${escapePointerSegment(key)}`),
  );
}
