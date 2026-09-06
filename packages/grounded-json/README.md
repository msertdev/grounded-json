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

Evidence supports provenance, not factual truth. Read the [full documentation](https://github.com/msertdev/grounded-json#readme), [security policy](https://github.com/msertdev/grounded-json/blob/main/SECURITY.md), and [examples](https://github.com/msertdev/grounded-json/tree/main/examples) on GitHub.

MIT © 2026 Murat Sert
