# grounded-json

Extract structured data. Keep the proof.

`grounded-json` is an ESM TypeScript SDK and CLI for turning local HTML into schema-valid JSON plus replayable field evidence. It parses source as inert data, performs no network requests, and never trusts a stored evidence status without replaying it.

```bash
npm install grounded-json
```

Node.js 22 or newer is required.

```bash
npx grounded-json demo
```

```ts
import { fromSelectors } from 'grounded-json';

const receipt = fromSelectors({
  html: '<h1>Field Notes</h1><data value="129"></data>',
  selectors: {
    '/name': { selector: 'h1' },
    '/price': {
      selector: 'data',
      attribute: 'value',
      transforms: ['parse-number'],
    },
  },
});
```

Key exports include `ground`, `fromSelectors`, `fromJsonLd`, `verifyReceipt`, `parseReceipt`, `renderReceiptHtml`, and the safe JSON Schema helpers.

## Receipt format

The package includes the draft 2020-12 JSON Schema for receipt format version 1
at `grounded-json/receipt.schema.json`. Resolve it with
`import.meta.resolve('grounded-json/receipt.schema.json')` and load it as JSON in
an external validator. The schema `$id` includes `v1`, matching
`manifest.version: 1`; this is independent of the npm package version.

Schema validation checks structure. Use `parseReceipt` and `verifyReceipt` for
semantic consistency, timestamp and byte limits, safe extraction schemas, hashes,
and replay. See the [receipt format documentation](https://github.com/msertdev/grounded-json#receipt-format)
and [committed examples](https://github.com/msertdev/grounded-json/tree/main/examples).

Evidence supports provenance, not factual truth. Read the [full documentation](https://github.com/msertdev/grounded-json#readme), [security policy](https://github.com/msertdev/grounded-json/blob/main/SECURITY.md), and [examples](https://github.com/msertdev/grounded-json/tree/main/examples) on GitHub.

MIT © 2026 Murat Sert
