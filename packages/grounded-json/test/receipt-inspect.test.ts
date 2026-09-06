import { describe, expect, it } from 'vitest';

import {
  ground,
  hashReceipt,
  parseReceipt,
  parseSafeJsonSchema,
  renderReceiptHtml,
} from '../src/index.js';

describe('safe schemas and receipt rendering', () => {
  it('rejects executable or expansive schema features', () => {
    expect(() =>
      parseSafeJsonSchema({ type: 'object', $ref: './code.js' }),
    ).toThrow(/Unsupported/u);
    const poisoned = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
    ) as unknown;
    expect(() => parseSafeJsonSchema(poisoned)).toThrow(/Unsafe/u);
  });

  it('rejects unknown receipt fields', () => {
    const receipt = ground({
      data: { ok: true },
      sources: [{ mediaType: 'text/plain', content: 'true' }],
      evidence: [{ pointer: '/ok', quote: 'true', transforms: ['boolean'] }],
      options: { embedSources: true },
    });
    expect(() => parseReceipt({ ...receipt, surprise: 'nope' })).toThrow();
  });

  it('escapes evidence in a script-free offline report', () => {
    const attack = '<img src=x onerror=alert(1)>';
    const receipt = ground({
      data: { title: attack },
      sources: [{ mediaType: 'text/plain', content: attack }],
      evidence: [{ pointer: '/title', quote: attack }],
      options: { embedSources: true },
    });
    const html = renderReceiptHtml(receipt);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain(attack);
    expect(html).not.toContain('<script');
    expect(html).toContain("default-src 'none'");
  });

  it('refuses to render a receipt with a mismatched digest', () => {
    const receipt = ground({
      data: { ok: true },
      sources: [{ mediaType: 'text/plain', content: 'true' }],
      evidence: [{ pointer: '/ok', quote: 'true', transforms: ['boolean'] }],
    });
    const tampered = structuredClone(receipt);
    (tampered.data as { ok: boolean }).ok = false;
    expect(() => renderReceiptHtml(tampered)).toThrow(/digest/u);
  });

  it('rejects forged coverage even when the digest is recomputed', () => {
    const receipt = ground({
      data: { ok: true },
      sources: [{ mediaType: 'text/plain', content: 'true' }],
      evidence: [{ pointer: '/ok', quote: 'true', transforms: ['boolean'] }],
    });
    receipt.coverage.grounded = 0;
    receipt.coverage.missing = 1;
    receipt.coverage.ratio = 0;
    receipt.manifest.receiptHash = hashReceipt(receipt);
    expect(() => parseReceipt(receipt)).toThrow(/Coverage/u);
  });
});
