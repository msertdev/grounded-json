import { canonicalJson } from './canonical.js';
import { isJsonValue } from './normalizers.js';
import type { GroundingIssue, JsonValue } from './types.js';

export interface SafeJsonSchema {
  $schema?: 'https://json-schema.org/draft/2020-12/schema';
  title?: string;
  description?: string;
  type:
    | 'object'
    | 'array'
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'null';
  properties?: Record<string, SafeJsonSchema>;
  required?: string[];
  items?: SafeJsonSchema;
  enum?: JsonValue[];
  additionalProperties?: boolean;
}

const ALLOWED_KEYS = new Set([
  '$schema',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'additionalProperties',
]);
const ALLOWED_TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function parseSafeJsonSchema(value: unknown): SafeJsonSchema {
  validateSchemaShape(value, 0, { nodes: 0 });
  return value as SafeJsonSchema;
}

function validateSchemaShape(
  value: unknown,
  depth: number,
  budget: { nodes: number },
): void {
  if (depth > 32)
    throw new TypeError('Schema nesting exceeds the v0.1 limit of 32.');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Every schema node must be an object.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Schema nodes must be plain objects.');
  }
  budget.nodes += 1;
  if (budget.nodes > 2_048)
    throw new TypeError('Schema exceeds the v0.1 node limit of 2048.');

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new TypeError(`Unsafe schema key: ${key}`);
    }
    if (!ALLOWED_KEYS.has(key)) {
      throw new TypeError(
        `Unsupported JSON Schema keyword in safe v0.1 subset: ${key}`,
      );
    }
  }

  if (typeof record.type !== 'string' || !ALLOWED_TYPES.has(record.type)) {
    throw new TypeError(
      'Every schema node must declare one supported string type.',
    );
  }
  for (const metadataKey of ['$schema', 'title', 'description'] as const) {
    if (
      record[metadataKey] !== undefined &&
      typeof record[metadataKey] !== 'string'
    ) {
      throw new TypeError(`${metadataKey} must be a string.`);
    }
  }
  if (
    record.$schema !== undefined &&
    record.$schema !== 'https://json-schema.org/draft/2020-12/schema'
  ) {
    throw new TypeError('Only JSON Schema draft 2020-12 is accepted.');
  }

  if (record.properties !== undefined) {
    if (record.type !== 'object')
      throw new TypeError('properties is only valid on object schemas.');
    if (
      record.properties === null ||
      typeof record.properties !== 'object' ||
      Array.isArray(record.properties)
    ) {
      throw new TypeError('properties must be an object.');
    }
    const propertiesPrototype = Object.getPrototypeOf(record.properties);
    if (
      propertiesPrototype !== Object.prototype &&
      propertiesPrototype !== null
    ) {
      throw new TypeError('properties must be a plain object.');
    }
    const entries = Object.entries(
      record.properties as Record<string, unknown>,
    );
    if (entries.length > 512)
      throw new TypeError('Schema has more than 512 properties.');
    for (const [key, child] of entries) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new TypeError(`Unsafe schema property: ${key}`);
      }
      validateSchemaShape(child, depth + 1, budget);
    }
  }

  if (record.required !== undefined) {
    if (
      record.type !== 'object' ||
      !Array.isArray(record.required) ||
      !record.required.every(
        (key) => typeof key === 'string' && !FORBIDDEN_KEYS.has(key),
      )
    ) {
      throw new TypeError(
        'required must be an array of safe property names on an object schema.',
      );
    }
    if (
      record.required.length > 512 ||
      new Set(record.required).size !== record.required.length
    ) {
      throw new TypeError(
        'required must contain at most 512 unique property names.',
      );
    }
  }
  if (record.items !== undefined) {
    if (record.type !== 'array')
      throw new TypeError('items is only valid on array schemas.');
    validateSchemaShape(record.items, depth + 1, budget);
  }
  if (
    record.additionalProperties !== undefined &&
    (record.type !== 'object' ||
      typeof record.additionalProperties !== 'boolean')
  ) {
    throw new TypeError(
      'additionalProperties must be a boolean on an object schema.',
    );
  }
  if (record.enum !== undefined) {
    if (
      !Array.isArray(record.enum) ||
      record.enum.length === 0 ||
      record.enum.length > 256 ||
      !record.enum.every((item) => isJsonValue(item))
    ) {
      throw new TypeError('enum must contain 1 to 256 JSON-safe values.');
    }
  }
}

export function validateSafeJsonSchema(
  value: JsonValue,
  schema: SafeJsonSchema,
  pointer = '',
): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  const actualType = jsonType(value);
  if (
    schema.type &&
    actualType !== schema.type &&
    !(schema.type === 'number' && actualType === 'integer')
  ) {
    issues.push({
      code: 'schema-invalid',
      pointer,
      message: `Expected ${schema.type}; received ${actualType}.`,
    });
    return issues;
  }

  if (
    schema.enum &&
    !schema.enum.some(
      (candidate) => canonicalJson(candidate) === canonicalJson(value),
    )
  ) {
    issues.push({
      code: 'schema-invalid',
      pointer,
      message: 'Value is not present in the allowed enum.',
    });
  }

  if (
    schema.type === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object'
  ) {
    const object = value as Record<string, JsonValue>;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(object, key)) {
        issues.push({
          code: 'schema-invalid',
          pointer: `${pointer}/${escapeSegment(key)}`,
          message: 'Required property is missing.',
        });
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(object, key)) {
        issues.push(
          ...validateSafeJsonSchema(
            object[key]!,
            child,
            `${pointer}/${escapeSegment(key)}`,
          ),
        );
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          issues.push({
            code: 'schema-invalid',
            pointer: `${pointer}/${escapeSegment(key)}`,
            message: 'Additional property is not allowed.',
          });
        }
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      issues.push(
        ...validateSafeJsonSchema(item, schema.items!, `${pointer}/${index}`),
      );
    });
  }
  return issues;
}

function jsonType(value: JsonValue): SafeJsonSchema['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value as 'object' | 'string' | 'number' | 'boolean';
}

function escapeSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
