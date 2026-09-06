import { z } from 'zod';

import { canonicalJson } from './canonical.js';
import { listLeafPointers, parsePointer } from './json-pointer.js';
import { isJsonValue } from './normalizers.js';
import { parseSafeJsonSchema } from './schema.js';
import { MAX_SOURCE_BYTES } from './source.js';
import type { GroundedReceipt, JsonValue } from './types.js';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const hashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const boundedString = z.string().max(16 * 1024);
const pointerSchema = z
  .string()
  .max(4_096)
  .refine((pointer) => {
    try {
      parsePointer(pointer);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid or unsafe RFC 6901 JSON Pointer.');
const jsonValueSchema = z.custom<JsonValue>((value) => isJsonValue(value), {
  message: 'Expected a prototype-safe JSON value.',
});

const evidenceSchema = z
  .object({
    pointer: pointerSchema,
    quote: boundedString,
    match: boundedString.optional(),
    selector: z.string().min(1).max(1_024).optional(),
    selectorIndex: z.number().int().nonnegative().optional(),
    attribute: z.string().min(1).max(256).optional(),
    transforms: z
      .array(
        z.enum([
          'trim',
          'lowercase',
          'parse-number',
          'currency-code',
          'iso-date',
          'boolean',
          'json-decode',
        ]),
      )
      .max(16)
      .optional(),
    sourceId: z.string().min(1).max(256).refine(isPrintable),
    sourceHash: hashSchema,
    status: z.enum(['grounded', 'missing', 'ambiguous', 'invalid']),
    observedValue: jsonValueSchema.optional(),
    reason: z.string().max(4_096).optional(),
  })
  .strict();

const issueCodeSchema = z.enum([
  'missing-evidence',
  'pointer-not-found',
  'source-not-found',
  'quote-not-found',
  'ambiguous-anchor',
  'selector-invalid',
  'selector-not-found',
  'selector-index-out-of-range',
  'attribute-not-found',
  'match-not-in-quote',
  'normalization-failed',
  'value-mismatch',
  'source-hash-mismatch',
  'receipt-hash-mismatch',
  'verification-mismatch',
  'schema-invalid',
]);

const receiptSchema = z
  .object({
    manifest: z
      .object({
        format: z.literal('grounded-json/receipt'),
        version: z.literal(1),
        createdAt: z
          .string()
          .max(64)
          .refine(
            (value) => Number.isFinite(Date.parse(value)),
            'Invalid timestamp.',
          ),
        receiptHash: hashSchema,
      })
      .strict(),
    data: jsonValueSchema,
    schema: z
      .object({
        dialect: z.literal('https://json-schema.org/draft/2020-12/schema'),
        subset: z.literal('grounded-json/safe-v1'),
        document: jsonValueSchema,
        contentHash: hashSchema,
      })
      .strict()
      .optional(),
    sources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(256).refine(isPrintable),
            mediaType: z.enum(['text/html', 'text/plain']),
            contentHash: hashSchema,
            bytes: z.number().int().nonnegative().max(MAX_SOURCE_BYTES),
            url: z.string().max(2_048).optional(),
            retrievedAt: z
              .string()
              .max(64)
              .refine((value) => Number.isFinite(Date.parse(value)))
              .optional(),
            content: z
              .string()
              .refine(
                (value) => Buffer.byteLength(value, 'utf8') <= MAX_SOURCE_BYTES,
                'Embedded source exceeds the v0.1 size limit.',
              )
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    evidence: z.record(pointerSchema, z.array(evidenceSchema).max(64)),
    issues: z
      .array(
        z
          .object({
            code: issueCodeSchema,
            pointer: pointerSchema.optional(),
            sourceId: z.string().min(1).max(256).refine(isPrintable).optional(),
            message: z.string().max(4_096),
          })
          .strict(),
      )
      .max(10_000),
    coverage: z
      .object({
        grounded: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
        ambiguous: z.number().int().nonnegative(),
        invalid: z.number().int().nonnegative(),
        ratio: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

/** Parse untrusted JSON into a bounded receipt before verification or rendering. */
export function parseReceipt(value: unknown): GroundedReceipt {
  if (!isJsonValue(value))
    throw new TypeError('Receipt must be prototype-safe JSON.');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > MAX_RECEIPT_BYTES) {
    throw new RangeError('Receipt exceeds the 10 MiB v0.1 limit.');
  }

  const parsed = receiptSchema.parse(value);
  const sourceIds = new Set<string>();
  const sourceHashes = new Map<string, string>();
  for (const source of parsed.sources) {
    if (sourceIds.has(source.id))
      throw new TypeError(`Duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
    sourceHashes.set(source.id, source.contentHash);
    if (
      source.content !== undefined &&
      Buffer.byteLength(source.content, 'utf8') !== source.bytes
    ) {
      throw new TypeError(
        `Embedded source byte count does not match for ${source.id}.`,
      );
    }
  }
  for (const [pointer, records] of Object.entries(parsed.evidence)) {
    for (const record of records) {
      if (record.pointer !== pointer) {
        throw new TypeError(
          `Evidence map key ${pointer} does not match record pointer ${record.pointer}.`,
        );
      }
      if (!sourceIds.has(record.sourceId)) {
        throw new TypeError(
          `Evidence references unknown source id: ${record.sourceId}`,
        );
      }
      if (record.sourceHash !== sourceHashes.get(record.sourceId)) {
        throw new TypeError(
          `Evidence source hash does not match ${record.sourceId}.`,
        );
      }
      if (record.status === 'grounded' && record.observedValue === undefined) {
        throw new TypeError(
          `Source-backed evidence is missing observedValue at ${pointer}.`,
        );
      }
    }
  }
  if (parsed.schema) parseSafeJsonSchema(parsed.schema.document);

  const terminals = listLeafPointers(parsed.data);
  if (terminals.length !== parsed.coverage.total) {
    throw new TypeError('Coverage total does not match candidate terminals.');
  }
  for (const pointer of terminals) {
    if (!Object.hasOwn(parsed.evidence, pointer)) {
      throw new TypeError(
        `Receipt has no evidence entry for terminal ${pointer || '<root>'}.`,
      );
    }
  }
  const recomputed = coverageFromStored(terminals, parsed.evidence);
  if (canonicalJson(recomputed) !== canonicalJson(parsed.coverage)) {
    throw new TypeError(
      'Coverage counters do not match stored evidence statuses.',
    );
  }

  return parsed as unknown as GroundedReceipt;
}

function coverageFromStored(
  terminals: string[],
  evidence: Record<string, z.infer<typeof evidenceSchema>[]>,
) {
  let grounded = 0;
  let missing = 0;
  let ambiguous = 0;
  let invalid = 0;
  for (const pointer of terminals) {
    const records = evidence[pointer] ?? [];
    if (records.length === 0) missing += 1;
    else if (records.some((record) => record.status === 'invalid'))
      invalid += 1;
    else if (records.some((record) => record.status === 'ambiguous'))
      ambiguous += 1;
    else if (records.some((record) => record.status === 'grounded'))
      grounded += 1;
    else missing += 1;
  }
  return {
    grounded,
    total: terminals.length,
    missing,
    ambiguous,
    invalid,
    ratio: terminals.length === 0 ? 1 : grounded / terminals.length,
  };
}

function isPrintable(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

export function safeParseReceipt(
  value: unknown,
): { success: true; data: GroundedReceipt } | { success: false; error: Error } {
  try {
    return { success: true, data: parseReceipt(value) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new TypeError('Invalid receipt.'),
    };
  }
}
