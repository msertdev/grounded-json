#!/usr/bin/env node

import { isUtf8 } from 'node:buffer';
import { lstat, open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { fromJsonLd } from './jsonld.js';
import { renderReceiptHtml } from './inspect.js';
import { parseReceipt, MAX_RECEIPT_BYTES } from './receipt.js';
import { parseSafeJsonSchema } from './schema.js';
import type { SafeJsonSchema } from './schema.js';
import { MAX_SOURCE_BYTES } from './source.js';
import { sanitizeTerminalText } from './terminal.js';
import { verifyReceipt } from './ground.js';
import type { GroundedReceipt, SourceInput } from './types.js';

const VERSION = '0.1.0';
const JSON_LIMIT = 1024 * 1024;

interface ParsedArgs {
  positionals: string[];
  values: Map<string, string>;
  flags: Set<string>;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (
    !command ||
    command === '--help' ||
    command === '-h' ||
    command === 'help'
  ) {
    writeStdout(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    writeStdout(`${VERSION}\n`);
    return 0;
  }

  switch (command) {
    case 'demo':
      return runDemo(rest);
    case 'from-jsonld':
      return runFromJsonLd(rest);
    case 'verify':
      return runVerify(rest);
    case 'inspect':
      return runInspect(rest);
    default:
      throw new CliError(`Unknown command: ${command}\n\n${HELP}`, 1);
  }
}

async function runDemo(argv: string[]): Promise<number> {
  const args = parseArgs(argv, new Set(), new Set(['--json', '--help']));
  if (args.flags.has('--help')) {
    writeStdout(DEMO_HELP);
    return 0;
  }
  if (args.positionals.length > 0)
    throw new CliError('demo does not accept positional arguments.');

  const receipt = fromJsonLd({
    html: DEMO_HTML,
    type: 'Product',
    jsonSchema: DEMO_SCHEMA,
    source: { id: 'demo:pricing-page' },
    options: {
      embedSources: false,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  if (args.flags.has('--json')) {
    writeStdout(`${JSON.stringify(receipt, null, 2)}\n`);
    return 0;
  }
  writeStdout(renderSummary(receipt));
  return 0;
}

async function runFromJsonLd(argv: string[]): Promise<number> {
  const args = parseArgs(
    argv,
    new Set(['--type', '--node-index', '--schema', '--out']),
    new Set(['--embed-source', '--force', '--help']),
  );
  if (args.flags.has('--help')) {
    writeStdout(FROM_JSONLD_HELP);
    return 0;
  }
  if (args.positionals.length !== 1) {
    throw new CliError('from-jsonld requires exactly one local HTML file.');
  }
  if (args.flags.has('--force') && !args.values.has('--out')) {
    throw new CliError('--force is only meaningful together with --out.');
  }

  const inputPath = localPath(args.positionals[0]!);
  const html = await readUtf8(inputPath, MAX_SOURCE_BYTES, 'HTML source');
  const schemaPath = args.values.get('--schema');
  const jsonSchema =
    schemaPath === undefined
      ? undefined
      : parseSafeJsonSchema(
          await readJson(localPath(schemaPath), JSON_LIMIT, 'JSON Schema'),
        );
  const nodeIndexRaw = args.values.get('--node-index');
  const nodeIndex =
    nodeIndexRaw === undefined
      ? undefined
      : parseIndex(nodeIndexRaw, '--node-index');

  const receipt = fromJsonLd({
    html,
    ...(args.values.get('--type') === undefined
      ? {}
      : { type: args.values.get('--type')! }),
    ...(nodeIndex === undefined ? {} : { nodeIndex }),
    ...(jsonSchema === undefined ? {} : { jsonSchema }),
    source: { id: 'source:local-html' },
    options: { embedSources: args.flags.has('--embed-source') },
  });
  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  const outputPath = args.values.get('--out');
  if (outputPath === undefined) {
    writeStdout(output);
  } else {
    const protectedPaths = [inputPath];
    if (schemaPath !== undefined) protectedPaths.push(localPath(schemaPath));
    const resolvedOutput = localPath(outputPath);
    rejectProtectedOutput(resolvedOutput, protectedPaths);
    await writeFileSafely(resolvedOutput, output, args.flags.has('--force'));
    writeStdout(`Wrote receipt: ${sanitizeTerminalText(resolvedOutput)}\n`);
  }
  return receipt.issues.length === 0 ? 0 : 2;
}

async function runVerify(argv: string[]): Promise<number> {
  const args = parseArgs(
    argv,
    new Set(['--source']),
    new Set(['--json', '--help']),
  );
  if (args.flags.has('--help')) {
    writeStdout(VERIFY_HELP);
    return 0;
  }
  if (args.positionals.length < 1 || args.positionals.length > 2) {
    throw new CliError(
      'verify requires a receipt and, when sources are not embedded, one local source file.',
    );
  }
  if (args.positionals.length === 2 && args.values.has('--source')) {
    throw new CliError(
      'Pass the source as a positional argument or --source, not both.',
    );
  }

  const receiptPath = localPath(args.positionals[0]!);
  const receipt = parseReceipt(
    await readJson(receiptPath, MAX_RECEIPT_BYTES, 'receipt'),
  );
  const sourcePathRaw = args.values.get('--source') ?? args.positionals[1];
  const sources: SourceInput[] = [];
  if (sourcePathRaw !== undefined) {
    if (receipt.sources.length !== 1) {
      throw new CliError(
        'The simple v0.1 CLI accepts one external source only; use the SDK for multi-source receipts.',
      );
    }
    const sourcePath = localPath(sourcePathRaw);
    sources.push({
      id: receipt.sources[0]!.id,
      mediaType: receipt.sources[0]!.mediaType,
      content: await readUtf8(sourcePath, MAX_SOURCE_BYTES, 'source'),
    });
  }

  const verification = verifyReceipt(receipt, sources);
  if (args.flags.has('--json')) {
    writeStdout(`${JSON.stringify(verification, null, 2)}\n`);
  } else if (verification.ok) {
    writeStdout(
      `PASS  ${receipt.coverage.grounded}/${receipt.coverage.total} fields reproduced from the source snapshot\n`,
    );
    writeStdout(`      ${receipt.manifest.receiptHash}\n`);
  } else {
    writeStdout(
      `FAIL  ${verification.issues.length} verification issue${verification.issues.length === 1 ? '' : 's'}\n`,
    );
    for (const issue of verification.issues) {
      writeStdout(
        `      ${sanitizeTerminalText(issue.code)}: ${sanitizeTerminalText(issue.message)}\n`,
      );
    }
  }
  return verification.ok ? 0 : 2;
}

async function runInspect(argv: string[]): Promise<number> {
  const args = parseArgs(
    argv,
    new Set(['--out']),
    new Set(['--force', '--help']),
  );
  if (args.flags.has('--help')) {
    writeStdout(INSPECT_HELP);
    return 0;
  }
  if (args.positionals.length !== 1)
    throw new CliError('inspect requires exactly one receipt file.');

  const receiptPath = localPath(args.positionals[0]!);
  const receipt = parseReceipt(
    await readJson(receiptPath, MAX_RECEIPT_BYTES, 'receipt'),
  );
  const outputPath = localPath(
    args.values.get('--out') ?? 'grounded-json-report.html',
  );
  rejectProtectedOutput(outputPath, [receiptPath]);
  await writeFileSafely(
    outputPath,
    renderReceiptHtml(receipt),
    args.flags.has('--force'),
  );
  writeStdout(`Wrote offline report: ${sanitizeTerminalText(outputPath)}\n`);
  return 0;
}

function parseArgs(
  argv: string[],
  valueOptions: Set<string>,
  booleanOptions: Set<string>,
): ParsedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let positionalOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (positionalOnly) {
      positionals.push(token);
      continue;
    }
    if (token === '--') {
      positionalOnly = true;
      continue;
    }
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    if (booleanOptions.has(token)) {
      if (flags.has(token)) throw new CliError(`Duplicate option: ${token}`);
      flags.add(token);
      continue;
    }
    if (valueOptions.has(token)) {
      if (values.has(token)) throw new CliError(`Duplicate option: ${token}`);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--'))
        throw new CliError(`Missing value for ${token}.`);
      values.set(token, value);
      index += 1;
      continue;
    }
    throw new CliError(`Unknown option: ${token}`);
  }
  return { positionals, values, flags };
}

function localPath(value: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(value)) {
    throw new CliError(
      'Network URLs are intentionally unsupported in v0.1; save the page locally first.',
    );
  }
  if (value.includes('\0'))
    throw new CliError('Paths may not contain null bytes.');
  return resolve(value);
}

async function readUtf8(
  path: string,
  maxBytes: number,
  label: string,
): Promise<string> {
  const details = await stat(path).catch(() => undefined);
  if (!details?.isFile())
    throw new CliError(
      `${label} is not a regular local file: ${sanitizeTerminalText(path)}`,
    );
  if (details.size > maxBytes)
    throw new CliError(`${label} exceeds the ${maxBytes}-byte limit.`);
  const handle = await open(path, 'r');
  try {
    const buffer = await handle.readFile();
    if (buffer.byteLength > maxBytes)
      throw new CliError(`${label} exceeds the ${maxBytes}-byte limit.`);
    if (!isUtf8(buffer)) throw new CliError(`${label} must use valid UTF-8.`);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

async function readJson(
  path: string,
  maxBytes: number,
  label: string,
): Promise<unknown> {
  const text = await readUtf8(path, maxBytes, label);
  try {
    return JSON.parse(text.replace(/^\uFEFF/u, '')) as unknown;
  } catch {
    throw new CliError(`${label} is not valid JSON.`);
  }
}

async function writeFileSafely(
  path: string,
  content: string,
  force: boolean,
): Promise<void> {
  if (force) {
    const details = await lstat(path).catch((error: unknown) => {
      if (isErrorCode(error, 'ENOENT')) return undefined;
      throw error;
    });
    if (details?.isSymbolicLink()) {
      throw new CliError(
        'Refusing to replace an output path that is a symbolic link.',
      );
    }
  }
  const handle = await open(path, force ? 'w' : 'wx', 0o600).catch(
    (error: unknown) => {
      if (isErrorCode(error, 'EEXIST')) {
        throw new CliError(
          `Output already exists: ${sanitizeTerminalText(path)} (pass --force to replace it)`,
        );
      }
      throw error;
    },
  );
  try {
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
}

function rejectProtectedOutput(
  outputPath: string,
  protectedPaths: string[],
): void {
  const normalized = outputPath.toLocaleLowerCase('en-US');
  if (
    protectedPaths.some(
      (path) => path.toLocaleLowerCase('en-US') === normalized,
    )
  ) {
    throw new CliError('Output path must not overwrite an input file.');
  }
}

function parseIndex(value: string, option: string): number {
  if (!/^(0|[1-9]\d*)$/u.test(value))
    throw new CliError(`${option} must be a non-negative integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 10_000) {
    throw new CliError(`${option} must be at most 10000.`);
  }
  return parsed;
}

function renderSummary(receipt: GroundedReceipt): string {
  const lines = [
    `PASS  ${receipt.coverage.grounded}/${receipt.coverage.total} fields are source-backed`,
  ];
  for (const [pointer, records] of Object.entries(receipt.evidence)) {
    const record = records[0];
    if (record?.status === 'grounded') {
      const observed = JSON.stringify(record.observedValue) ?? 'null';
      lines.push(
        `      ${sanitizeTerminalText(pointer)} <- ${sanitizeTerminalText(observed, 160)}`,
      );
    }
  }
  lines.push(`      ${receipt.manifest.receiptHash}`);
  lines.push('');
  lines.push(
    'Evidence supports where a value came from; it does not prove the source is true.',
  );
  return `${lines.join('\n')}\n`;
}

function writeStdout(value: string): void {
  process.stdout.write(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

const DEMO_SCHEMA: SafeJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['name', 'price', 'currency', 'available'],
  properties: {
    name: { type: 'string' },
    price: { type: 'number' },
    currency: { type: 'string' },
    available: { type: 'boolean' },
  },
};

const DEMO_HTML = `<!doctype html><html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Field Notes Pro","price":129,"currency":"USD","available":true}</script></head><body><h1>Field Notes Pro</h1></body></html>`;

const HELP = `grounded-json ${VERSION} — extract structured data and keep the proof

Usage:
  grounded-json demo [--json]
  grounded-json from-jsonld <page.html> [--type Product] [--schema schema.json] [--out receipt.json]
  grounded-json verify <receipt.json> [source.html] [--json]
  grounded-json inspect <receipt.json> [--out report.html]

v0.1 reads local files only. It never fetches URLs or executes page scripts.
Run grounded-json <command> --help for command options.
`;

const DEMO_HELP = `Usage: grounded-json demo [--json]

Runs a deterministic built-in example without files or network access.
`;

const FROM_JSONLD_HELP = `Usage: grounded-json from-jsonld <page.html> [options]

Options:
  --type <name>          Exact JSON-LD @type to select
  --node-index <number>  Resolve an intentional multi-node match
  --schema <file>        Safe declarative JSON Schema subset (.json only)
  --out <file>           Write the receipt instead of stdout
  --embed-source         Include source bytes (may contain private data)
  --force                Replace an existing output file
`;

const VERIFY_HELP = `Usage: grounded-json verify <receipt.json> [source.html] [--json]

Replays every evidence transform. A source file is required unless embedded.
`;

const INSPECT_HELP = `Usage: grounded-json inspect <receipt.json> [options]

Options:
  --out <file>  Output path (default: grounded-json-report.html)
  --force       Replace an existing output file

The report is self-contained, script-free, and makes no network requests.
`;

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unexpected CLI failure.';
      process.stderr.write(
        `grounded-json: ${sanitizeTerminalText(message, 8_192)}\n`,
      );
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    });
}
