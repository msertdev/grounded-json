import { hashReceipt } from './ground.js';
import { parseReceipt } from './receipt.js';
import type { EvidenceRecord, GroundedReceipt } from './types.js';

/** Creates a self-contained, script-free receipt viewer suitable for local review. */
export function renderReceiptHtml(untrustedReceipt: GroundedReceipt): string {
  const receipt = parseReceipt(untrustedReceipt);
  if (hashReceipt(receipt) !== receipt.manifest.receiptHash) {
    throw new TypeError('Receipt digest does not match its content.');
  }
  const coverage = `${receipt.coverage.grounded}/${receipt.coverage.total}`;
  const ratio = `${Math.round(receipt.coverage.ratio * 100)}%`;
  const fields = Object.entries(receipt.evidence)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pointer, records]) => renderField(pointer, records))
    .join('');
  const issues =
    receipt.issues.length === 0
      ? '<p class="empty">No recorded issues.</p>'
      : `<ul class="issues">${receipt.issues.map((issue) => `<li><code>${escapeHtml(issue.code)}</code> ${escapeHtml(issue.message)}</li>`).join('')}</ul>`;
  const sources = receipt.sources
    .map(
      (source) => `
    <li>
      <strong>${escapeHtml(source.id)}</strong>
      <span>${escapeHtml(source.mediaType)} · ${source.bytes.toLocaleString('en-US')} bytes</span>
      <code>${escapeHtml(source.contentHash)}</code>
      ${source.content === undefined ? '' : '<em>source embedded (not displayed)</em>'}
    </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <title>grounded-json receipt</title>
  <style>${STYLES}</style>
</head>
<body>
  <header>
    <div><span class="eyebrow">GROUNDING RECEIPT · V1</span><h1>Every accepted field keeps its source.</h1></div>
    <div class="score"><strong>${escapeHtml(ratio)}</strong><span>${escapeHtml(coverage)} source-backed fields</span></div>
  </header>
  <main>
    <section class="panel summary">
      <div><span>Receipt digest</span><code>${escapeHtml(receipt.manifest.receiptHash)}</code></div>
      <div><span>Created</span><strong>${escapeHtml(receipt.manifest.createdAt)}</strong></div>
      <div><span>Meaning</span><strong>Digest matches. Replay with source bytes for a full verdict.</strong></div>
    </section>
    <section class="grid">
      <div class="panel"><div class="panel-title"><span>Structured data</span><small>candidate</small></div><pre>${escapeHtml(JSON.stringify(receipt.data, null, 2))}</pre></div>
      <div class="panel"><div class="panel-title"><span>Field evidence</span><small>${receipt.coverage.total} terminals</small></div><div class="fields">${fields}</div></div>
    </section>
    <section class="panel"><div class="panel-title"><span>Issues</span><small>${receipt.issues.length}</small></div>${issues}</section>
    <section class="panel"><div class="panel-title"><span>Source snapshots</span><small>${receipt.sources.length}</small></div><ul class="sources">${sources}</ul></section>
  </main>
  <footer>Evidence supports provenance, not factual truth · no scripts · no network requests</footer>
</body>
</html>`;
}

function renderField(pointer: string, records: EvidenceRecord[]): string {
  if (records.length === 0) {
    return `<article class="field"><div class="field-head"><code>${escapeHtml(pointer || '<root>')}</code><span class="badge missing">missing</span></div><p>No evidence supplied.</p></article>`;
  }
  return records
    .map((record) => {
      const label =
        record.status === 'grounded' ? 'source-backed' : record.status;
      return `<article class="field">
      <div class="field-head"><code>${escapeHtml(pointer || '<root>')}</code><span class="badge ${escapeHtml(record.status)}">${escapeHtml(label)}</span></div>
      <blockquote>${escapeHtml(record.quote)}</blockquote>
      <dl>
        <dt>source</dt><dd><code>${escapeHtml(record.sourceId)}</code></dd>
        ${record.selector === undefined ? '' : `<dt>selector</dt><dd><code>${escapeHtml(record.selector)}</code></dd>`}
        ${record.transforms === undefined || record.transforms.length === 0 ? '' : `<dt>transforms</dt><dd>${escapeHtml(record.transforms.join(' → '))}</dd>`}
        ${record.reason === undefined ? '' : `<dt>reason</dt><dd>${escapeHtml(record.reason)}</dd>`}
      </dl>
    </article>`;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STYLES = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#08100f;color:#e7f6f1}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 85% 0,#12342d 0,transparent 32rem),#08100f}header,main,footer{width:min(1180px,calc(100% - 32px));margin:auto}header{display:flex;justify-content:space-between;gap:24px;align-items:end;padding:64px 0 28px}h1{font-size:clamp(2rem,5vw,4rem);letter-spacing:-.055em;line-height:.98;max-width:760px;margin:10px 0 0}.eyebrow,.panel-title,dt{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#8ec4b4}.score{display:grid;min-width:170px;text-align:right}.score strong{font-size:3rem;color:#75f0c2}.score span{color:#92a8a2}.panel{border:1px solid #25463e;background:rgba(10,24,21,.88);box-shadow:0 18px 60px rgba(0,0,0,.22);border-radius:14px;padding:20px}.summary{display:grid;grid-template-columns:2fr 1fr 2fr;gap:20px;margin-bottom:16px}.summary div{display:grid;gap:8px}.summary span{color:#789089;font-size:.8rem}.summary code{overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:1fr 1.15fr;gap:16px;margin-bottom:16px}.panel-title{display:flex;justify-content:space-between;border-bottom:1px solid #203a34;padding-bottom:12px;margin-bottom:16px}.panel-title small{color:#607a72}pre{white-space:pre-wrap;word-break:break-word;margin:0;color:#c9fff0;font:13px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace}.fields{display:grid;gap:10px;max-height:720px;overflow:auto}.field{border:1px solid #1f3b34;background:#0a1715;border-radius:10px;padding:14px}.field-head{display:flex;justify-content:space-between;gap:16px}.field blockquote{margin:12px 0;padding:10px 12px;border-left:2px solid #53d9ab;background:#0d201c;color:#d8f8ed;overflow-wrap:anywhere}.badge{border:1px solid currentColor;border-radius:99px;padding:3px 8px;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em}.grounded{color:#72edbd}.invalid{color:#ff9e80}.ambiguous{color:#ffd36b}.missing{color:#91a39e}dl{display:grid;grid-template-columns:80px 1fr;gap:6px;margin:0;font-size:.78rem}dt{color:#668079}dd{margin:0;overflow-wrap:anywhere}.issues,.sources{display:grid;gap:10px;padding-left:20px}.issues code{color:#ffb094}.sources li{display:grid;gap:5px}.sources span,.sources em{color:#789089;font-size:.78rem}.sources code{overflow-wrap:anywhere;color:#8fcab8}.empty{color:#789089}footer{padding:28px 0 48px;color:#607a72;font-size:.8rem}@media(max-width:800px){header{align-items:start;flex-direction:column}.score{text-align:left}.grid,.summary{grid-template-columns:1fr}}
`;
