// Ground a recorded LLM extraction against its source.
// Run from the repo root after `npm run build:package`:
//   node examples/llm/run.mjs
import { readFileSync } from 'node:fs';
import { ground } from 'grounded-json';
import { z } from 'zod';

const dir = new URL('./', import.meta.url);
const source = readFileSync(new URL('source.txt', dir), 'utf8');
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
  sources: [{ mediaType: 'text/plain', content: source }],
  evidence,
  schema: z.object({
    title: z.string(),
    city: z.string(),
    salaryMin: z.number(),
    remote: z.string(),
    germanLevel: z.string(),
  }),
});

console.log('coverage:', receipt.coverage);
for (const issue of receipt.issues)
  console.log(`REJECT ${issue.pointer}: ${issue.code}`);
