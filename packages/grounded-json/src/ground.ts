import type { ZodType } from 'zod';

import { canonicalJson, jsonClone, sha256 } from './canonical.js';
import {
  getAtPointer,
  listLeafPointers,
  parsePointer,
} from './json-pointer.js';
import {
  applyNormalizers,
  isJsonValue,
  normalizeWhitespace,
} from './normalizers.js';
import { parseSafeJsonSchema, validateSafeJsonSchema } from './schema.js';
import { prepareSource } from './source.js';
import type { SafeJsonSchema } from './schema.js';
import type {
  CoverageSummary,
  EvidenceClaim,
  EvidenceRecord,
  GroundedReceipt,
  GroundingIssue,
  GroundOptions,
  JsonValue,
  ReceiptVerification,
  SourceInput,
} from './types.js';

export interface GroundInput<T extends JsonValue> {
  data: T;
  sources: SourceInput[];
  evidence: EvidenceClaim[];
  schema?: ZodType<T>;
  /** Portable declarative schema used by receipts and the CLI. */
  jsonSchema?: SafeJsonSchema;
  options?: GroundOptions;
}

const MAX_DATA_BYTES = 10 * 1024 * 1024;
const MAX_SOURCES = 64;
const MAX_CLAIMS = 10_000;
const NORMALIZERS = new Set([
  'trim',
  'lowercase',
  'parse-number',
  'currency-code',
  'iso-date',
  'boolean',
  'json-decode',
]);

export class GroundingError extends Error {
  readonly receipt: GroundedReceipt;

  constructor(receipt: GroundedReceipt) {
    const count = receipt.coverage.total - receipt.coverage.grounded;
    super(
      `Grounding failed: ${count} unsupported field${count === 1 ? '' : 's'} and ${receipt.issues.length} issue${receipt.issues.length === 1 ? '' : 's'}.`,
    );
    this.name = 'GroundingError';
    this.receipt = receipt;
  }
}

export function ground<T extends JsonValue>(
  input: GroundInput<T>,
): GroundedReceipt<T> {
  const options = input.options ?? {};
  if (!isJsonValue(input.data)) {
    throw new TypeError('Candidate data must be finite, prototype-safe JSON.');
  }
  if (Buffer.byteLength(canonicalJson(input.data), 'utf8') > MAX_DATA_BYTES) {
    throw new RangeError('Candidate data exceeds the 10 MiB v0.1 limit.');
  }
  if (input.sources.length === 0 || input.sources.length > MAX_SOURCES) {
    throw new RangeError(`Grounding requires 1 to ${MAX_SOURCES} sources.`);
  }
  if (input.evidence.length > MAX_CLAIMS) {
    throw new RangeError(
      `Evidence exceeds the v0.1 limit of ${MAX_CLAIMS} claims.`,
    );
  }
  for (const claim of input.evidence) assertEvidenceClaim(claim);

  let data = jsonClone(input.data);
  const schemaIssues: GroundingIssue[] = [];
  if (input.schema) {
    const result = input.schema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const pointer = issue.path.length
          ? `/${issue.path.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
          : '';
        schemaIssues.push({
          code: 'schema-invalid',
          pointer,
          message: issue.message,
        });
      }
    } else {
      if (!isJsonValue(result.data)) {
        throw new TypeError('Schema output must remain JSON-safe.');
      }
      data = jsonClone(result.data);
      if (Buffer.byteLength(canonicalJson(data), 'utf8') > MAX_DATA_BYTES) {
        throw new RangeError('Schema output exceeds the 10 MiB v0.1 limit.');
      }
    }
  }
  if (input.jsonSchema) {
    const jsonSchema = parseSafeJsonSchema(input.jsonSchema);
    schemaIssues.push(...validateSafeJsonSchema(data, jsonSchema));
  }

  const prepared = input.sources
    .map((source) =>
      prepareSource(source, { embed: options.embedSources ?? false }),
    )
    .sort((left, right) => left.snapshot.id.localeCompare(right.snapshot.id));
  const sourcesById = new Map(
    prepared.map((source) => [source.snapshot.id, source]),
  );
  if (sourcesById.size !== prepared.length) {
    throw new TypeError('Source ids must be unique within a receipt.');
  }

  const leaves = listLeafPointers(data);
  if (leaves.length > MAX_CLAIMS) {
    throw new RangeError(
      `Candidate exceeds the v0.1 limit of ${MAX_CLAIMS} terminals.`,
    );
  }
  const leafSet = new Set(leaves);
  const records: Record<string, EvidenceRecord[]> = Object.create(
    null,
  ) as Record<string, EvidenceRecord[]>;
  const issues: GroundingIssue[] = [...schemaIssues];

  const orderedClaims = [...input.evidence].sort(compareClaims);
  for (const claim of orderedClaims) {
    const record = evaluateClaim(claim, data, prepared, sourcesById);
    (records[claim.pointer] ??= []).push(record);
    if (record.status !== 'grounded') {
      issues.push({
        code: issueCodeForRecord(record),
        pointer: claim.pointer,
        ...(record.sourceId ? { sourceId: record.sourceId } : {}),
        message:
          record.reason ?? 'Evidence did not support the candidate value.',
      });
    }
    if (!leafSet.has(claim.pointer)) {
      issues.push({
        code: 'pointer-not-found',
        pointer: claim.pointer,
        ...(record.sourceId ? { sourceId: record.sourceId } : {}),
        message: 'Evidence points to a missing or non-leaf candidate field.',
      });
    }
  }

  for (const pointer of leaves) {
    if (!(pointer in records)) records[pointer] = [];
  }

  const coverage = calculateCoverage(leaves, records);
  for (const pointer of leaves) {
    if (records[pointer]!.length === 0) {
      issues.push({
        code: 'missing-evidence',
        pointer,
        message: 'No evidence was supplied for this field.',
      });
    }
  }

  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const draft = {
    manifest: {
      format: 'grounded-json/receipt' as const,
      version: 1 as const,
      createdAt,
      receiptHash: zeroHash(),
    },
    data,
    ...(input.jsonSchema
      ? {
          schema: {
            dialect: 'https://json-schema.org/draft/2020-12/schema' as const,
            subset: 'grounded-json/safe-v1' as const,
            document: jsonClone(input.jsonSchema as unknown as JsonValue),
            contentHash: sha256(
              canonicalJson(input.jsonSchema as unknown as JsonValue),
            ),
          },
        }
      : {}),
    sources: prepared.map((source) => source.snapshot),
    evidence: records,
    issues: deduplicateIssues(issues).sort(compareIssues),
    coverage,
  } satisfies GroundedReceipt<T>;
  draft.manifest.receiptHash = hashReceipt(draft);

  if (
    options.strict &&
    (draft.coverage.ratio !== 1 || draft.issues.length > 0)
  ) {
    throw new GroundingError(draft);
  }
  return draft;
}

function evaluateClaim(
  claim: EvidenceClaim,
  data: JsonValue,
  prepared: ReturnType<typeof prepareSource>[],
  sourcesById: Map<string, ReturnType<typeof prepareSource>>,
): EvidenceRecord {
  const sourceId =
    claim.sourceId ?? (prepared.length === 1 ? prepared[0]!.snapshot.id : '');
  const source = sourcesById.get(sourceId);
  const base = {
    pointer: claim.pointer,
    quote: claim.quote,
    ...(claim.match === undefined ? {} : { match: claim.match }),
    ...(claim.selector === undefined ? {} : { selector: claim.selector }),
    ...(claim.selectorIndex === undefined
      ? {}
      : { selectorIndex: claim.selectorIndex }),
    ...(claim.attribute === undefined ? {} : { attribute: claim.attribute }),
    ...(claim.transforms === undefined
      ? {}
      : { transforms: [...claim.transforms] }),
    sourceId,
    sourceHash: source?.snapshot.contentHash ?? zeroHash(),
  };

  if (!source) {
    return {
      ...base,
      status: 'invalid',
      reason: 'Evidence source could not be resolved.',
    };
  }
  const target = getAtPointer(data, claim.pointer);
  if (
    !target.found ||
    target.value === undefined ||
    (typeof target.value === 'object' &&
      target.value !== null &&
      (Array.isArray(target.value)
        ? target.value.length > 0
        : Object.keys(target.value).length > 0))
  ) {
    return {
      ...base,
      status: 'invalid',
      reason: 'Pointer does not identify a terminal candidate value.',
    };
  }
  const anchor = source.findAnchor(claim);
  if (!anchor.ok) {
    return {
      ...base,
      status: anchor.code === 'ambiguous-anchor' ? 'ambiguous' : 'invalid',
      reason: anchor.message,
    };
  }

  const normalizedQuote = normalizeWhitespace(claim.quote);
  const initial = claim.match ?? normalizedQuote;
  if (
    claim.match !== undefined &&
    !normalizedQuote.includes(normalizeWhitespace(claim.match))
  ) {
    return {
      ...base,
      status: 'invalid',
      reason: 'The selected match is not contained in the evidence quote.',
    };
  }

  let observedValue: JsonValue;
  try {
    observedValue = applyNormalizers(initial, claim.transforms);
  } catch (error) {
    return {
      ...base,
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'Normalization failed.',
    };
  }

  if (canonicalJson(observedValue) !== canonicalJson(target.value)) {
    return {
      ...base,
      status: 'invalid',
      observedValue,
      reason:
        'The deterministic transform does not reproduce the candidate value.',
    };
  }
  return { ...base, status: 'grounded', observedValue };
}

function calculateCoverage(
  leaves: string[],
  records: Record<string, EvidenceRecord[]>,
): CoverageSummary {
  let grounded = 0;
  let missing = 0;
  let ambiguous = 0;
  let invalid = 0;

  for (const pointer of leaves) {
    const fieldRecords = records[pointer] ?? [];
    if (fieldRecords.length === 0) {
      missing += 1;
      continue;
    }
    if (fieldRecords.some((record) => record.status === 'invalid')) {
      invalid += 1;
      continue;
    }
    if (fieldRecords.some((record) => record.status === 'ambiguous')) {
      ambiguous += 1;
      continue;
    }
    if (fieldRecords.some((record) => record.status === 'grounded'))
      grounded += 1;
    else missing += 1;
  }

  return {
    grounded,
    total: leaves.length,
    missing,
    ambiguous,
    invalid,
    ratio: leaves.length === 0 ? 1 : grounded / leaves.length,
  };
}

export function hashReceipt(receipt: GroundedReceipt): `sha256:${string}` {
  const payload = jsonClone({
    manifest: {
      format: receipt.manifest.format,
      version: receipt.manifest.version,
      createdAt: receipt.manifest.createdAt,
    },
    data: receipt.data,
    ...(receipt.schema === undefined ? {} : { schema: receipt.schema }),
    sources: receipt.sources,
    evidence: receipt.evidence,
    issues: receipt.issues,
    coverage: receipt.coverage,
  } as unknown as JsonValue);
  return sha256(`grounded-json/receipt/v1\0${canonicalJson(payload)}`);
}

export function verifyReceipt(
  receipt: GroundedReceipt,
  sourceInputs: SourceInput[] = [],
): ReceiptVerification {
  const issues: GroundingIssue[] = [];
  let replayCoverage = receipt.coverage;
  if (hashReceipt(receipt) !== receipt.manifest.receiptHash) {
    issues.push({
      code: 'receipt-hash-mismatch',
      message: 'Receipt content does not match its digest.',
    });
  }

  if (sourceInputs.length > receipt.sources.length) {
    issues.push({
      code: 'verification-mismatch',
      message: 'More source inputs were supplied than the receipt declares.',
    });
  }

  const identifiedSourceIds = sourceInputs
    .map((source) => source.id)
    .filter((id): id is string => id !== undefined);
  if (new Set(identifiedSourceIds).size !== identifiedSourceIds.length) {
    issues.push({
      code: 'verification-mismatch',
      message: 'Supplied source ids must be unique.',
    });
  }

  const suppliedById = new Map(
    sourceInputs.flatMap((source) =>
      source.id === undefined ? [] : [[source.id, source] as const],
    ),
  );
  const replayInputs: SourceInput[] = [];
  for (const snapshot of receipt.sources) {
    const soleUnidentified =
      receipt.sources.length === 1 && sourceInputs.length === 1
        ? sourceInputs[0]
        : undefined;
    const external = suppliedById.get(snapshot.id) ?? soleUnidentified;
    const supplied =
      external ??
      (snapshot.content === undefined
        ? undefined
        : ({
            id: snapshot.id,
            mediaType: snapshot.mediaType,
            content: snapshot.content,
            ...(snapshot.url === undefined ? {} : { url: snapshot.url }),
            ...(snapshot.retrievedAt === undefined
              ? {}
              : { retrievedAt: snapshot.retrievedAt }),
          } satisfies SourceInput));
    if (!supplied) {
      issues.push({
        code: 'source-not-found',
        sourceId: snapshot.id,
        message: 'Source bytes are required to replay this receipt.',
      });
      continue;
    }
    const bound: SourceInput = { ...supplied, id: snapshot.id };
    replayInputs.push(bound);
    let replayedHash: `sha256:${string}`;
    try {
      replayedHash = prepareSource(bound).snapshot.contentHash;
    } catch (error) {
      issues.push({
        code: 'verification-mismatch',
        sourceId: snapshot.id,
        message:
          error instanceof Error ? error.message : 'Source preparation failed.',
      });
      continue;
    }
    if (replayedHash !== snapshot.contentHash) {
      issues.push({
        code: 'source-hash-mismatch',
        sourceId: snapshot.id,
        message: 'Supplied source bytes do not match the receipt.',
      });
    }
  }

  const sourceFailure = issues.some(
    (issue) =>
      issue.code === 'source-not-found' ||
      issue.code === 'source-hash-mismatch' ||
      (issue.code === 'verification-mismatch' && issue.sourceId !== undefined),
  );
  if (replayInputs.length === receipt.sources.length && !sourceFailure) {
    try {
      const claims = Object.values(receipt.evidence).flatMap((records) =>
        records.map(toEvidenceClaim),
      );
      const jsonSchema = receipt.schema
        ? parseSafeJsonSchema(receipt.schema.document)
        : undefined;
      if (
        receipt.schema &&
        sha256(canonicalJson(receipt.schema.document)) !==
          receipt.schema.contentHash
      ) {
        issues.push({
          code: 'verification-mismatch',
          message: 'Portable schema content does not match its digest.',
        });
      }

      const replayed = ground({
        data: receipt.data,
        sources: replayInputs,
        evidence: claims,
        ...(jsonSchema === undefined ? {} : { jsonSchema }),
        options: { now: () => new Date(receipt.manifest.createdAt) },
      });
      replayCoverage = replayed.coverage;
      const evidenceMatches =
        canonicalJson(replayed.evidence as unknown as JsonValue) ===
        canonicalJson(receipt.evidence as unknown as JsonValue);
      const issuesMatch =
        canonicalJson(replayed.issues as unknown as JsonValue) ===
        canonicalJson(receipt.issues as unknown as JsonValue);
      const coverageMatches =
        canonicalJson(replayed.coverage as unknown as JsonValue) ===
        canonicalJson(receipt.coverage as unknown as JsonValue);
      if (!evidenceMatches || !issuesMatch || !coverageMatches) {
        issues.push({
          code: 'verification-mismatch',
          message:
            'Evidence verdicts or coverage could not be reproduced from the source.',
        });
      }
    } catch (error) {
      issues.push({
        code: 'verification-mismatch',
        message:
          error instanceof Error ? error.message : 'Receipt replay failed.',
      });
    }
  }

  return { ok: issues.length === 0, issues, coverage: replayCoverage };
}

function toEvidenceClaim(record: EvidenceRecord): EvidenceClaim {
  return {
    pointer: record.pointer,
    quote: record.quote,
    sourceId: record.sourceId,
    ...(record.match === undefined ? {} : { match: record.match }),
    ...(record.selector === undefined ? {} : { selector: record.selector }),
    ...(record.selectorIndex === undefined
      ? {}
      : { selectorIndex: record.selectorIndex }),
    ...(record.attribute === undefined ? {} : { attribute: record.attribute }),
    ...(record.transforms === undefined
      ? {}
      : { transforms: [...record.transforms] }),
  };
}

function assertEvidenceClaim(claim: EvidenceClaim): void {
  if (claim === null || typeof claim !== 'object') {
    throw new TypeError('Every evidence claim must be an object.');
  }
  if (typeof claim.pointer !== 'string') {
    throw new TypeError('Evidence pointer must be a string.');
  }
  parsePointer(claim.pointer);
  if (typeof claim.quote !== 'string' || claim.quote.length > 16 * 1024) {
    throw new TypeError('Evidence quote must be a string of at most 16 KiB.');
  }
  if (
    claim.match !== undefined &&
    (typeof claim.match !== 'string' || claim.match.length > 16 * 1024)
  ) {
    throw new TypeError('Evidence match must be a string of at most 16 KiB.');
  }
  if (
    claim.selector !== undefined &&
    (typeof claim.selector !== 'string' ||
      claim.selector.length === 0 ||
      claim.selector.length > 1_024)
  ) {
    throw new TypeError('Evidence selector must contain 1 to 1024 characters.');
  }
  if (
    claim.selectorIndex !== undefined &&
    (!Number.isSafeInteger(claim.selectorIndex) || claim.selectorIndex < 0)
  ) {
    throw new TypeError(
      'Evidence selectorIndex must be a non-negative safe integer.',
    );
  }
  if (
    claim.attribute !== undefined &&
    (typeof claim.attribute !== 'string' ||
      claim.attribute.length === 0 ||
      claim.attribute.length > 256)
  ) {
    throw new TypeError('Evidence attribute must contain 1 to 256 characters.');
  }
  if (
    claim.sourceId !== undefined &&
    (typeof claim.sourceId !== 'string' ||
      claim.sourceId.length === 0 ||
      claim.sourceId.length > 256)
  ) {
    throw new TypeError('Evidence sourceId must contain 1 to 256 characters.');
  }
  if (
    claim.transforms !== undefined &&
    (!Array.isArray(claim.transforms) ||
      claim.transforms.length > 16 ||
      !claim.transforms.every(
        (transform) =>
          typeof transform === 'string' && NORMALIZERS.has(transform),
      ))
  ) {
    throw new TypeError(
      'Evidence transforms contain an unsupported operation.',
    );
  }
}

function compareClaims(left: EvidenceClaim, right: EvidenceClaim): number {
  return canonicalJson(claimSortValue(left)).localeCompare(
    canonicalJson(claimSortValue(right)),
  );
}

function claimSortValue(claim: EvidenceClaim): JsonValue {
  return {
    pointer: claim.pointer,
    quote: claim.quote,
    sourceId: claim.sourceId ?? '',
    selector: claim.selector ?? '',
    selectorIndex: claim.selectorIndex ?? -1,
    attribute: claim.attribute ?? '',
    match: claim.match ?? '',
    transforms: claim.transforms ?? [],
  };
}

function compareIssues(left: GroundingIssue, right: GroundingIssue): number {
  const leftKey = `${left.pointer ?? ''}\0${left.code}\0${left.sourceId ?? ''}\0${left.message}`;
  const rightKey = `${right.pointer ?? ''}\0${right.code}\0${right.sourceId ?? ''}\0${right.message}`;
  return leftKey.localeCompare(rightKey);
}

function issueCodeForRecord(record: EvidenceRecord): GroundingIssue['code'] {
  const reason = record.reason ?? '';
  if (record.status === 'ambiguous') return 'ambiguous-anchor';
  if (reason.startsWith('Invalid CSS selector')) return 'selector-invalid';
  if (reason.startsWith('Selector did not match')) return 'selector-not-found';
  if (reason.startsWith('selectorIndex')) return 'selector-index-out-of-range';
  if (reason.startsWith('Attribute')) return 'attribute-not-found';
  if (reason.startsWith('Quote') || reason.startsWith('Evidence quote'))
    return 'quote-not-found';
  if (reason.startsWith('The selected match')) return 'match-not-in-quote';
  if (reason.startsWith('The deterministic transform')) return 'value-mismatch';
  if (reason.includes('source')) return 'source-not-found';
  if (reason.includes('Pointer')) return 'pointer-not-found';
  return 'normalization-failed';
}

function deduplicateIssues(issues: GroundingIssue[]): GroundingIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}\0${issue.pointer ?? ''}\0${issue.sourceId ?? ''}\0${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function zeroHash(): `sha256:${string}` {
  return `sha256:${'0'.repeat(64)}`;
}
