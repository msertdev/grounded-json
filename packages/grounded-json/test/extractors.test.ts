import { describe, expect, it } from 'vitest';

import {
  JsonLdExtractionError,
  fromJsonLd,
  fromSelectors,
} from '../src/index.js';

describe('JSON-LD extraction', () => {
  it('selects one type and projects to a safe schema', () => {
    const receipt = fromJsonLd({
      html: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Compass","price":49,"internal":"omit"}</script>`,
      type: 'Product',
      jsonSchema: {
        type: 'object',
        required: ['name', 'price'],
        properties: { name: { type: 'string' }, price: { type: 'number' } },
        additionalProperties: false,
      },
    });
    expect(receipt.data).toEqual({ name: 'Compass', price: 49 });
    expect(receipt.coverage.ratio).toBe(1);
  });

  it('requires an explicit choice when multiple nodes match', () => {
    expect(() =>
      fromJsonLd({
        html: `<script type="application/ld+json">[{"@type":"Product","name":"A"},{"@type":"Product","name":"B"}]</script>`,
        type: 'Product',
      }),
    ).toThrow(JsonLdExtractionError);
  });

  it('never executes source scripts', () => {
    delete (globalThis as { compromised?: boolean }).compromised;
    fromJsonLd({
      html: `<script>globalThis.compromised=true</script><script type="application/ld+json">{"@type":"Thing","name":"Safe"}</script>`,
      type: 'Thing',
    });
    expect(
      (globalThis as { compromised?: boolean }).compromised,
    ).toBeUndefined();
  });
});

describe('selector extraction', () => {
  it('extracts explicit DOM rules and replays transforms', () => {
    const receipt = fromSelectors({
      html: '<main><h1>  Field  Notes </h1><span data-price="129.50"></span></main>',
      selectors: {
        '/name': { selector: 'h1' },
        '/price': {
          selector: '[data-price]',
          attribute: 'data-price',
          transforms: ['parse-number'],
        },
      },
    });
    expect(receipt.data).toEqual({ name: 'Field Notes', price: 129.5 });
    expect(receipt.coverage.ratio).toBe(1);
  });

  it('rejects accidental multi-node matches', () => {
    expect(() =>
      fromSelectors({
        html: '<p>A</p><p>B</p>',
        selectors: { '/value': { selector: 'p' } },
      }),
    ).toThrow(/matched 2 nodes/u);
  });
});
