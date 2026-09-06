import { describe, expect, it } from 'vitest';

import {
  GroundingError,
  ground,
  hashReceipt,
  verifyReceipt,
} from '../src/index.js';
import type { GroundedReceipt } from '../src/index.js';

const html = `<!doctype html><main>
  <h1>Trail Runner 2</h1>
  <span class="price">€ 1.299,50</span>
  <span class="available">yes</span>
  <code class="nil">null</code>
  <code class="tags">[]</code>
</main>`;

function makeReceipt(embedSources = true) {
  return ground({
    data: {
      name: 'Trail Runner 2',
      price: 1299.5,
      available: true,
      note: null,
      tags: [],
    },
    sources: [{ id: 'page', mediaType: 'text/html', content: html }],
    evidence: [
      { pointer: '/name', quote: 'Trail Runner 2', selector: 'h1' },
      {
        pointer: '/price',
        quote: '€ 1.299,50',
        selector: '.price',
        transforms: ['parse-number'],
      },
      {
        pointer: '/available',
        quote: 'yes',
        selector: '.available',
        transforms: ['boolean'],
      },
      {
        pointer: '/note',
        quote: 'null',
        selector: '.nil',
        transforms: ['json-decode'],
      },
      {
        pointer: '/tags',
        quote: '[]',
        selector: '.tags',
        transforms: ['json-decode'],
      },
    ],
    options: {
      strict: true,
      embedSources,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
  });
}

describe('ground', () => {
  it('reproduces every terminal, including null and an empty array', () => {
    const receipt = makeReceipt();
    expect(receipt.coverage).toEqual({
      grounded: 5,
      total: 5,
      missing: 0,
      ambiguous: 0,
      invalid: 0,
      ratio: 1,
    });
    expect(verifyReceipt(receipt)).toMatchObject({ ok: true });
  });

  it('replays an unembedded source supplied later', () => {
    const receipt = makeReceipt(false);
    expect(
      verifyReceipt(receipt, [{ mediaType: 'text/html', content: html }]).ok,
    ).toBe(true);
  });

  it('uses an explicitly supplied source even when bytes were embedded', () => {
    const receipt = makeReceipt(true);
    const result = verifyReceipt(receipt, [
      { mediaType: 'text/html', content: `${html}<p>tampered</p>` },
    ]);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'source-hash-mismatch'),
    ).toBe(true);
  });

  it('detects a forged evidence verdict even after the outer digest is recomputed', () => {
    const forged = structuredClone(makeReceipt()) as unknown as GroundedReceipt;
    forged.evidence['/name']![0]!.observedValue = 'not the source value';
    forged.manifest.receiptHash = hashReceipt(forged);
    const result = verifyReceipt(forged);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'verification-mismatch'),
    ).toBe(true);
  });

  it('fails strict mode on ambiguous evidence', () => {
    expect(() =>
      ground({
        data: { value: 'same' },
        sources: [{ mediaType: 'text/plain', content: 'same and same' }],
        evidence: [{ pointer: '/value', quote: 'same' }],
        options: { strict: true },
      }),
    ).toThrow(GroundingError);
  });

  it('detects overlapping duplicate quotes', () => {
    expect(() =>
      ground({
        data: { value: 'aa' },
        sources: [{ mediaType: 'text/plain', content: 'aaa' }],
        evidence: [{ pointer: '/value', quote: 'aa' }],
        options: { strict: true },
      }),
    ).toThrow(GroundingError);
  });

  it('produces the same digest regardless of claim and source input order', () => {
    const input = {
      data: { left: 'alpha', right: 'beta' },
      sources: [
        { id: 'b', mediaType: 'text/plain' as const, content: 'beta' },
        { id: 'a', mediaType: 'text/plain' as const, content: 'alpha' },
      ],
      evidence: [
        { pointer: '/right', quote: 'beta', sourceId: 'b' },
        { pointer: '/left', quote: 'alpha', sourceId: 'a' },
      ],
      options: { now: () => new Date('2026-01-01T00:00:00.000Z') },
    };
    const first = ground(input);
    const second = ground({
      ...input,
      sources: [...input.sources].reverse(),
      evidence: [...input.evidence].reverse(),
    });
    expect(first.manifest.receiptHash).toBe(second.manifest.receiptHash);
  });

  it('keeps missing required schema properties explicit', () => {
    expect(() =>
      ground({
        data: { name: 'Only name' },
        sources: [{ mediaType: 'text/plain', content: 'Only name' }],
        evidence: [{ pointer: '/name', quote: 'Only name' }],
        jsonSchema: {
          type: 'object',
          required: ['name', 'price'],
          properties: { name: { type: 'string' }, price: { type: 'number' } },
          additionalProperties: false,
        },
        options: { strict: true },
      }),
    ).toThrow(GroundingError);
  });
});
