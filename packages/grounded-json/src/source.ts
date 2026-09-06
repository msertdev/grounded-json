import { parseHTML } from 'linkedom';

import { sha256 } from './canonical.js';
import { normalizeWhitespace } from './normalizers.js';
import type { SourceInput, SourceSnapshot } from './types.js';

export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_QUOTE = 16 * 1024;

export interface PreparedSource {
  input: SourceInput;
  snapshot: SourceSnapshot;
  visibleText: string;
  findAnchor(options: {
    quote: string;
    selector?: string;
    selectorIndex?: number;
    attribute?: string;
  }): AnchorResult;
}

export type AnchorResult =
  | { ok: true; text: string; occurrences: number }
  | {
      ok: false;
      code:
        | 'quote-not-found'
        | 'ambiguous-anchor'
        | 'selector-invalid'
        | 'selector-not-found'
        | 'selector-index-out-of-range'
        | 'attribute-not-found';
      message: string;
    };

export function prepareSource(
  input: SourceInput,
  options: { embed?: boolean } = {},
): PreparedSource {
  if (input.mediaType !== 'text/html' && input.mediaType !== 'text/plain') {
    throw new TypeError('Source mediaType must be text/html or text/plain.');
  }
  if (!isWellFormedUnicode(input.content)) {
    throw new TypeError('Source content must be well-formed Unicode.');
  }
  const bytes = Buffer.byteLength(input.content, 'utf8');
  if (bytes > MAX_SOURCE_BYTES) {
    throw new RangeError(
      `Source exceeds the ${MAX_SOURCE_BYTES}-byte v0.1 limit.`,
    );
  }

  const contentHash = sha256(input.content);
  const id = input.id ?? `source:${contentHash.slice(7, 19)}`;
  if (id.length === 0 || id.length > 256 || containsControl(id)) {
    throw new TypeError(
      'Source id must contain 1 to 256 printable characters.',
    );
  }
  if (
    input.retrievedAt !== undefined &&
    (input.retrievedAt.length > 64 ||
      !Number.isFinite(Date.parse(input.retrievedAt)))
  ) {
    throw new TypeError(
      'retrievedAt must be a valid timestamp of at most 64 characters.',
    );
  }
  const snapshot: SourceSnapshot = {
    id,
    mediaType: input.mediaType,
    contentHash,
    bytes,
    ...(input.url === undefined ? {} : { url: redactUrl(input.url) }),
    ...(input.retrievedAt === undefined
      ? {}
      : { retrievedAt: input.retrievedAt }),
    ...(options.embed ? { content: input.content } : {}),
  };

  if (input.mediaType === 'text/plain') {
    const visibleText = normalizeWhitespace(input.content);
    return {
      input,
      snapshot,
      visibleText,
      findAnchor: ({ quote, selector, selectorIndex, attribute }) => {
        if (
          selector !== undefined ||
          selectorIndex !== undefined ||
          attribute !== undefined
        ) {
          return {
            ok: false,
            code: 'selector-invalid',
            message: 'CSS selectors and attributes require an HTML source.',
          };
        }
        return findQuote(visibleText, quote);
      },
    };
  }

  const { document } = parseHTML(input.content);
  for (const element of Array.from(
    document.querySelectorAll(
      'script:not([type="application/ld+json"]), style, noscript, template',
    ),
  )) {
    element.remove();
  }
  const textRoot = document.body?.cloneNode(true) as Element | undefined;
  if (textRoot) {
    for (const element of Array.from(
      textRoot.querySelectorAll('script, style, noscript, template'),
    )) {
      element.remove();
    }
  }
  const visibleText = normalizeWhitespace(
    textRoot?.textContent ?? document.textContent ?? '',
  );

  return {
    input,
    snapshot,
    visibleText,
    findAnchor: ({ quote, selector, selectorIndex, attribute }) => {
      if (!selector) return findQuote(visibleText, quote);

      if (
        selectorIndex !== undefined &&
        (!Number.isSafeInteger(selectorIndex) || selectorIndex < 0)
      ) {
        return {
          ok: false,
          code: 'selector-index-out-of-range',
          message: 'selectorIndex must be a non-negative safe integer.',
        };
      }

      let matches: NodeListOf<Element>;
      try {
        matches = document.querySelectorAll(selector);
      } catch {
        return {
          ok: false,
          code: 'selector-invalid',
          message: `Invalid CSS selector: ${selector}`,
        };
      }
      if (matches.length === 0) {
        return {
          ok: false,
          code: 'selector-not-found',
          message: `Selector did not match the snapshot: ${selector}`,
        };
      }

      if (selectorIndex === undefined && matches.length > 1) {
        return {
          ok: false,
          code: 'ambiguous-anchor',
          message: `Selector matched ${matches.length} nodes; set selectorIndex explicitly.`,
        };
      }
      const index = selectorIndex ?? 0;
      const match = matches.item(index);
      if (!match) {
        return {
          ok: false,
          code: 'selector-index-out-of-range',
          message: `selectorIndex ${index} is outside ${matches.length} matches.`,
        };
      }

      const anchoredText =
        attribute === undefined
          ? match.textContent
          : match.getAttribute(attribute);
      if (anchoredText === null) {
        return {
          ok: false,
          code: 'attribute-not-found',
          message: `Attribute ${attribute} was not present on the selected node.`,
        };
      }
      return findQuote(normalizeWhitespace(anchoredText), quote);
    },
  };
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function containsControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function findQuote(haystack: string, rawQuote: string): AnchorResult {
  const quote = normalizeWhitespace(rawQuote);
  if (quote.length === 0) {
    return {
      ok: false,
      code: 'quote-not-found',
      message: 'Evidence quote is empty.',
    };
  }
  if (Buffer.byteLength(quote, 'utf8') > MAX_EVIDENCE_QUOTE) {
    return {
      ok: false,
      code: 'quote-not-found',
      message: 'Evidence quote exceeds the 16 KiB limit.',
    };
  }

  let occurrences = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(quote, offset)) !== -1) {
    occurrences += 1;
    offset += 1;
    if (occurrences > 1) break;
  }
  if (occurrences === 0) {
    return {
      ok: false,
      code: 'quote-not-found',
      message: 'Quote was not found at the evidence anchor.',
    };
  }
  if (occurrences > 1) {
    return {
      ok: false,
      code: 'ambiguous-anchor',
      message: 'Quote occurs more than once at the evidence anchor.',
    };
  }
  return { ok: true, text: quote, occurrences };
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}
