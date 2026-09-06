import { parseHTML } from 'linkedom';
import type { ZodType } from 'zod';

import { ground } from './ground.js';
import { getAtPointer, listLeafPointers } from './json-pointer.js';
import { isJsonValue } from './normalizers.js';
import { parseSafeJsonSchema } from './schema.js';
import type { SafeJsonSchema } from './schema.js';
import type {
  EvidenceClaim,
  GroundedReceipt,
  GroundOptions,
  JsonValue,
  SourceInput,
} from './types.js';

export interface JsonLdExtractionInput<T extends JsonValue = JsonValue> {
  html: string;
  /** Select a schema.org node by exact @type. Required when the page is ambiguous. */
  type?: string;
  /** Select one node from the filtered list, zero-based. */
  nodeIndex?: number;
  source?: Omit<SourceInput, 'content' | 'mediaType'>;
  schema?: ZodType<T>;
  jsonSchema?: SafeJsonSchema;
  options?: GroundOptions;
}

export class JsonLdExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonLdExtractionError';
  }
}

interface JsonLdNode {
  value: Record<string, JsonValue>;
  scriptIndex: number;
}

/** Extracts one local JSON-LD node and generates replayable evidence for every terminal value. */
export function fromJsonLd<T extends JsonValue = JsonValue>(
  input: JsonLdExtractionInput<T>,
): GroundedReceipt<T> {
  if (
    input.nodeIndex !== undefined &&
    (!Number.isSafeInteger(input.nodeIndex) || input.nodeIndex < 0)
  ) {
    throw new JsonLdExtractionError(
      'nodeIndex must be a non-negative safe integer.',
    );
  }

  const { document } = parseHTML(input.html);
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  );
  if (scripts.length === 0)
    throw new JsonLdExtractionError('No JSON-LD scripts were found.');

  const nodes: JsonLdNode[] = [];
  scripts.forEach((script, scriptIndex) => {
    const raw = script.textContent ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new JsonLdExtractionError(
        `JSON-LD script ${scriptIndex} is not valid JSON.`,
      );
    }
    if (!isJsonValue(parsed)) {
      throw new JsonLdExtractionError(
        `JSON-LD script ${scriptIndex} contains unsafe JSON.`,
      );
    }
    collectNodes(parsed, scriptIndex, nodes, 0);
  });

  const candidates =
    input.type === undefined
      ? nodes
      : nodes.filter((node) => hasType(node.value, input.type!));
  if (candidates.length === 0) {
    throw new JsonLdExtractionError(
      input.type
        ? `No JSON-LD node has @type ${input.type}.`
        : 'No JSON-LD objects were found.',
    );
  }
  if (input.nodeIndex === undefined && candidates.length > 1) {
    throw new JsonLdExtractionError(
      `Selection is ambiguous: ${candidates.length} JSON-LD nodes matched; set type or nodeIndex.`,
    );
  }
  const selected = candidates[input.nodeIndex ?? 0];
  if (!selected) {
    throw new JsonLdExtractionError(
      `nodeIndex ${input.nodeIndex} is outside ${candidates.length} matching nodes.`,
    );
  }

  const portableSchema =
    input.jsonSchema === undefined
      ? undefined
      : parseSafeJsonSchema(input.jsonSchema);
  const withoutContext = omitContext(selected.value);
  const projected =
    portableSchema === undefined
      ? withoutContext
      : projectToSchema(withoutContext, portableSchema);
  if (!isJsonValue(projected))
    throw new JsonLdExtractionError('Selected JSON-LD is not JSON-safe.');
  if (
    projected !== null &&
    !Array.isArray(projected) &&
    typeof projected === 'object' &&
    Object.keys(projected).length === 0
  ) {
    throw new JsonLdExtractionError(
      'The schema projection did not select any JSON-LD fields.',
    );
  }

  const evidence: EvidenceClaim[] = listLeafPointers(projected).map(
    (pointer) => {
      const target = getAtPointer(projected, pointer);
      if (!target.found || target.value === undefined) {
        throw new JsonLdExtractionError(
          `Could not resolve projected pointer ${pointer}.`,
        );
      }
      return {
        pointer,
        quote: JSON.stringify(target.value),
        selector: 'script[type="application/ld+json"]',
        selectorIndex: selected.scriptIndex,
        transforms: ['json-decode'],
      };
    },
  );

  const source: SourceInput = {
    content: input.html,
    mediaType: 'text/html',
    ...(input.source?.id === undefined ? {} : { id: input.source.id }),
    ...(input.source?.url === undefined ? {} : { url: input.source.url }),
    ...(input.source?.retrievedAt === undefined
      ? {}
      : { retrievedAt: input.source.retrievedAt }),
  };
  return ground({
    data: projected as T,
    sources: [source],
    evidence,
    ...(input.schema === undefined ? {} : { schema: input.schema }),
    ...(portableSchema === undefined ? {} : { jsonSchema: portableSchema }),
    options: { strict: true, ...input.options },
  });
}

function collectNodes(
  value: JsonValue,
  scriptIndex: number,
  nodes: JsonLdNode[],
  depth: number,
): void {
  if (depth > 32 || nodes.length >= 2_048) {
    throw new JsonLdExtractionError(
      'JSON-LD exceeds the v0.1 traversal limits.',
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, scriptIndex, nodes, depth + 1);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const graph = value['@graph'];
  if (Array.isArray(graph)) {
    for (const item of graph) collectNodes(item, scriptIndex, nodes, depth + 1);
  } else {
    nodes.push({ value, scriptIndex });
  }
}

function hasType(node: Record<string, JsonValue>, requested: string): boolean {
  const type = node['@type'];
  return (
    type === requested || (Array.isArray(type) && type.includes(requested))
  );
}

function omitContext(
  node: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const output = Object.create(null) as Record<string, JsonValue>;
  for (const [key, value] of Object.entries(node)) {
    if (key !== '@context') output[key] = value;
  }
  return output;
}

function projectToSchema(value: JsonValue, schema: SafeJsonSchema): JsonValue {
  if (
    schema.type === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object'
  ) {
    const output = Object.create(null) as Record<string, JsonValue>;
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key))
        output[key] = projectToSchema(value[key]!, childSchema);
    }
    return output;
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    return value.map((item) => projectToSchema(item, schema.items!));
  }
  return value;
}
