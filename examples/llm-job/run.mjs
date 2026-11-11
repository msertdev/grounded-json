// Ground a recorded LLM extraction against a saved job posting page.
// Run from the repo root after `npm run build:package`:
//   node examples/llm-job/run.mjs
// The receipt is compared with expected-receipt.json; the run fails if
// the two differ. The clock is pinned so the receipt is reproducible.
import { readFileSync } from 'node:fs';
import { ground } from 'grounded-json';
import { z } from 'zod';

const dir = new URL('./', import.meta.url);
const page = readFileSync(new URL('page.html', dir), 'utf8');
const { _note, ...fields } = JSON.parse(
  readFileSync(new URL('llm-response.json', dir), 'utf8'),
);

// Prompt pattern: "For every field return { value, quote } where quote is copied verbatim from the source."
const data = Object.fromEntries(
  Object.entries(fields).map(([k, f]) => [k, f.value]),
);
const evidence = Object.entries(fields).map(([k, f]) => ({
  pointer: `/${k}`,
  quote: f.quote,
  ...(f.transforms && { transforms: f.transforms }),
}));

const receipt = ground({
  data,
  sources: [{ mediaType: 'text/html', content: page }],
  evidence,
  schema: z.object({
    title: z.string(),
    company: z.string(),
    location: z.string(),
    employmentType: z.string(),
    salaryMin: z.number(),
    signingBonus: z.number(),
  }),
  options: { now: () => new Date('2026-03-04T00:00:00.000Z') },
});

console.log('coverage:', receipt.coverage);
for (const issue of receipt.issues)
  console.log(`REJECT ${issue.pointer}: ${issue.code}`);

const expected = JSON.parse(
  readFileSync(new URL('expected-receipt.json', dir), 'utf8'),
);
if (JSON.stringify(receipt) !== JSON.stringify(expected)) {
  console.error('FAIL receipt differs from expected-receipt.json');
  process.exit(1);
}
console.log('PASS receipt matches expected-receipt.json');
