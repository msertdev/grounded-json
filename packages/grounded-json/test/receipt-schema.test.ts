import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  fromJsonLd,
  ground,
  parseReceipt,
  verifyReceipt,
} from '../src/index.js';
import type { GroundedReceipt, JsonValue } from '../src/index.js';

const packageRoot = new URL('../', import.meta.url);
const schema = JSON.parse(
  readFileSync(new URL('schemas/v1/receipt.schema.json', packageRoot), 'utf8'),
);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const examplesRoot = fileURLToPath(new URL('../../examples/', packageRoot));
const exampleReceipts = readdirSync(examplesRoot, {
  recursive: true,
  encoding: 'utf8',
})
  .filter((path) => path.endsWith('.json'))
  .map((path) => ({
    path,
    receipt: JSON.parse(readFileSync(resolve(examplesRoot, path), 'utf8')),
  }))
  .filter(
    ({ path, receipt }) =>
      path.endsWith('receipt.json') ||
      receipt?.manifest?.format === 'grounded-json/receipt',
  );

function makeReceipt() {
  return ground({
    data: { ok: true },
    sources: [{ mediaType: 'text/plain', content: 'true' }],
    evidence: [{ pointer: '/ok', quote: 'true', transforms: ['boolean'] }],
  });
}

describe('receipt version 1 JSON Schema', () => {
  it('has committed example receipts to validate', () => {
    expect(exampleReceipts.length).toBeGreaterThan(0);
  });

  it.each(exampleReceipts)(
    'validates the committed example $path',
    ({ receipt }) => {
      expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
      expect(() => parseReceipt(receipt)).not.toThrow();
    },
  );

  it.each([
    ['product', 'Product'],
    ['job', 'JobPosting'],
    ['article', 'Article'],
  ])('keeps the %s example reproducible', (directory, type) => {
    const fixture = new URL(`../../examples/${directory}/`, packageRoot);
    const html = readFileSync(new URL('page.html', fixture), 'utf8');
    const receipt = JSON.parse(
      readFileSync(new URL('receipt.json', fixture), 'utf8'),
    );
    const regenerated = fromJsonLd({
      html,
      type,
      jsonSchema: JSON.parse(
        readFileSync(new URL('schema.json', fixture), 'utf8'),
      ),
      options: { now: () => new Date(receipt.manifest.createdAt) },
    });
    expect(regenerated).toEqual(receipt);
    expect(
      verifyReceipt(receipt, [{ mediaType: 'text/html', content: html }]).ok,
    ).toBe(true);
  });

  it.each<JsonValue>([null, false, 0, '', [], {}, [1, { ok: true }]])(
    'accepts JSON terminal and container values: %j',
    (data) => {
      const quote = JSON.stringify(data);
      for (const embedSources of [false, true]) {
        const receipt = ground({
          data,
          sources: [{ mediaType: 'text/plain', content: quote }],
          evidence: [{ pointer: '', quote, transforms: ['json-decode'] }],
          options: { embedSources },
        });
        expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
      }
    },
  );

  it.each(['missing', 'ambiguous', 'invalid'] as const)(
    'accepts %s evidence without an observed value',
    (status) => {
      const receipt = makeReceipt();
      const record = receipt.evidence['/ok']![0]!;
      record.status = status;
      delete record.observedValue;
      expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
    },
  );

  it('accepts escaped pointer segments and optional evidence fields', () => {
    const receipt = ground({
      data: { 'a/b~c': true },
      sources: [
        { mediaType: 'text/html', content: '<data value="yes"></data>' },
      ],
      evidence: [
        {
          pointer: '/a~1b~0c',
          quote: 'yes',
          match: 'yes',
          selector: 'data',
          selectorIndex: 0,
          attribute: 'value',
          transforms: ['boolean'],
        },
      ],
    });
    expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
  });

  it('requires every top-level field except the optional schema snapshot', () => {
    for (const key of [
      'manifest',
      'data',
      'sources',
      'evidence',
      'issues',
      'coverage',
    ]) {
      const receipt = makeReceipt() as unknown as Record<string, unknown>;
      delete receipt[key];
      expect(validate(receipt), key).toBe(false);
    }
  });

  it.each([
    { name: 'unknown receipt field', path: ['extra'], value: true },
    {
      name: 'unknown manifest field',
      path: ['manifest', 'extra'],
      value: true,
    },
    { name: 'unsupported version', path: ['manifest', 'version'], value: 2 },
    { name: 'wrong format', path: ['manifest', 'format'], value: 'other' },
    {
      name: 'malformed hash',
      path: ['manifest', 'receiptHash'],
      value: 'sha256:abc',
    },
    { name: 'no sources', path: ['sources'], value: [] },
    {
      name: 'unsupported media type',
      path: ['sources', '0', 'mediaType'],
      value: 'text/javascript',
    },
    { name: 'negative bytes', path: ['sources', '0', 'bytes'], value: -1 },
    {
      name: 'oversized source',
      path: ['sources', '0', 'bytes'],
      value: 5242881,
    },
    {
      name: 'control character in source id',
      path: ['sources', '0', 'id'],
      value: 'bad\n',
    },
    {
      name: 'unknown transform',
      path: ['evidence', '/ok', '0', 'transforms'],
      value: ['eval'],
    },
    {
      name: 'too many transforms',
      path: ['evidence', '/ok', '0', 'transforms'],
      value: Array(17).fill('trim'),
    },
    {
      name: 'unknown evidence status',
      path: ['evidence', '/ok', '0', 'status'],
      value: 'trusted',
    },
    {
      name: 'fractional selector index',
      path: ['evidence', '/ok', '0', 'selectorIndex'],
      value: 0.5,
    },
    {
      name: 'invalid pointer escape',
      path: ['evidence', '/ok', '0', 'pointer'],
      value: '/bad~2',
    },
    {
      name: 'non-pointer evidence key',
      path: ['evidence'],
      value: { invalid: [] },
    },
    {
      name: 'unsafe pointer segment',
      path: ['evidence'],
      value: { '/constructor': [] },
    },
    {
      name: 'unsafe nested data key',
      path: ['data'],
      value: JSON.parse('{"nested":{"__proto__":true}}'),
    },
    {
      name: 'unknown issue code',
      path: ['issues'],
      value: [{ code: 'unknown', message: '' }],
    },
    { name: 'negative coverage', path: ['coverage', 'missing'], value: -1 },
    { name: 'fractional count', path: ['coverage', 'total'], value: 1.5 },
    { name: 'ratio above one', path: ['coverage', 'ratio'], value: 1.1 },
  ])('rejects $name', ({ path, value }) => {
    const receipt = makeReceipt();
    let target = receipt as unknown as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      target = target[key] as Record<string, unknown>;
    }
    target[path.at(-1)!] = value;
    expect(validate(receipt), JSON.stringify(validate.errors)).toBe(false);
  });

  it('requires observedValue for grounded evidence', () => {
    const receipt = makeReceipt();
    delete receipt.evidence['/ok']![0]!.observedValue;
    expect(validate(receipt)).toBe(false);
  });

  it('leaves cross-field and cryptographic checks to the runtime verifier', () => {
    const receipt: GroundedReceipt = makeReceipt();
    receipt.coverage.total = 2;
    expect(validate(receipt)).toBe(true);
    expect(() => parseReceipt(receipt)).toThrow(/Coverage/u);
  });
});
