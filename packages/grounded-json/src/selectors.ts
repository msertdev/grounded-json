import { parseHTML } from 'linkedom';
import type { ZodType } from 'zod';

import { ground } from './ground.js';
import { setAtPointer } from './json-pointer.js';
import {
  applyNormalizers,
  isJsonValue,
  normalizeWhitespace,
} from './normalizers.js';
import type { SafeJsonSchema } from './schema.js';
import type {
  EvidenceClaim,
  GroundedReceipt,
  GroundOptions,
  JsonValue,
  SelectorMap,
  SourceInput,
} from './types.js';

export interface SelectorExtractionInput<T extends JsonValue = JsonValue> {
  html: string;
  selectors: SelectorMap;
  source?: Omit<SourceInput, 'content' | 'mediaType'>;
  schema?: ZodType<T>;
  jsonSchema?: SafeJsonSchema;
  options?: GroundOptions;
}

export class SelectorExtractionError extends Error {
  readonly pointer: string;

  constructor(pointer: string, message: string) {
    super(`${pointer || '<root>'}: ${message}`);
    this.name = 'SelectorExtractionError';
    this.pointer = pointer;
  }
}

/**
 * Deterministically extracts local HTML with an explicit JSON Pointer -> CSS rule map.
 * The HTML is parsed as inert data; scripts are never executed.
 */
export function fromSelectors<T extends JsonValue = JsonValue>(
  input: SelectorExtractionInput<T>,
): GroundedReceipt<T> {
  const { document } = parseHTML(input.html);
  for (const element of Array.from(
    document.querySelectorAll(
      'script:not([type="application/ld+json"]), style, noscript, template',
    ),
  )) {
    element.remove();
  }

  const data = Object.create(null) as Record<string, JsonValue>;
  const evidence: EvidenceClaim[] = [];

  for (const [pointer, rule] of Object.entries(input.selectors)) {
    if (pointer === '') {
      throw new SelectorExtractionError(
        pointer,
        'Root assignment is not supported by selector maps.',
      );
    }
    if (!rule.selector || rule.selector.length > 1_024) {
      throw new SelectorExtractionError(
        pointer,
        'selector must contain 1 to 1024 characters.',
      );
    }
    if (
      rule.selectorIndex !== undefined &&
      (!Number.isSafeInteger(rule.selectorIndex) || rule.selectorIndex < 0)
    ) {
      throw new SelectorExtractionError(
        pointer,
        'selectorIndex must be a non-negative safe integer.',
      );
    }

    let matches: Element[];
    try {
      matches = Array.from(document.querySelectorAll(rule.selector));
    } catch {
      throw new SelectorExtractionError(
        pointer,
        `Invalid CSS selector: ${rule.selector}`,
      );
    }
    if (matches.length === 0) {
      throw new SelectorExtractionError(
        pointer,
        `Selector did not match: ${rule.selector}`,
      );
    }
    if (rule.selectorIndex === undefined && matches.length > 1) {
      throw new SelectorExtractionError(
        pointer,
        `Selector matched ${matches.length} nodes; set selectorIndex explicitly.`,
      );
    }

    const index = rule.selectorIndex ?? 0;
    const element = matches[index];
    if (!element) {
      throw new SelectorExtractionError(
        pointer,
        `selectorIndex ${index} is outside ${matches.length} matches.`,
      );
    }
    const raw =
      rule.attribute === undefined
        ? element.textContent
        : element.getAttribute(rule.attribute);
    if (raw === null) {
      throw new SelectorExtractionError(
        pointer,
        `Attribute ${rule.attribute} was not present.`,
      );
    }

    const quote = normalizeWhitespace(raw);
    if (!quote)
      throw new SelectorExtractionError(pointer, 'Selected evidence is empty.');
    let observed: JsonValue;
    try {
      observed = applyNormalizers(rule.match ?? quote, rule.transforms);
    } catch (error) {
      throw new SelectorExtractionError(
        pointer,
        error instanceof Error ? error.message : 'Normalization failed.',
      );
    }
    if (!isJsonValue(observed)) {
      throw new SelectorExtractionError(
        pointer,
        'The extracted value is not JSON-safe.',
      );
    }
    try {
      setAtPointer(data, pointer, observed);
    } catch (error) {
      throw new SelectorExtractionError(
        pointer,
        error instanceof Error
          ? error.message
          : 'Could not assign extracted value.',
      );
    }

    evidence.push({
      pointer,
      quote,
      selector: rule.selector,
      ...(rule.selectorIndex === undefined
        ? {}
        : { selectorIndex: rule.selectorIndex }),
      ...(rule.attribute === undefined ? {} : { attribute: rule.attribute }),
      ...(rule.match === undefined ? {} : { match: rule.match }),
      ...(rule.transforms === undefined
        ? {}
        : { transforms: [...rule.transforms] }),
    });
  }

  if (!isJsonValue(data)) {
    throw new TypeError(
      'Selector map produced an unsafe or sparse JSON value.',
    );
  }
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
    data: data as T,
    sources: [source],
    evidence,
    ...(input.schema === undefined ? {} : { schema: input.schema }),
    ...(input.jsonSchema === undefined ? {} : { jsonSchema: input.jsonSchema }),
    options: { strict: true, ...input.options },
  });
}
