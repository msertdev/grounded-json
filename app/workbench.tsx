'use client';

import {
  Braces,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clipboard,
  ExternalLink,
  FileCode2,
  GitFork,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SampleId = 'pricing' | 'job' | 'article';
type EvidenceStatus = 'supported' | 'unsupported';

interface EvidenceItem {
  field: string;
  value: string | number | null;
  quote: string;
  selector: string;
  hash: string;
  status: EvidenceStatus;
  explanation?: string;
}

type JsonLine =
  | { type: 'raw'; text: string }
  | { type: 'field'; pointer: string; display: string; indent?: number };

interface Sample {
  id: SampleId;
  tab: string;
  sourceFile: string;
  resultFile: string;
  type: string;
  hash: string;
  defaultPointer: string;
  command: string;
  evidence: Record<string, EvidenceItem>;
  json: JsonLine[];
}

const samples: Record<SampleId, Sample> = {
  pricing: {
    id: 'pricing',
    tab: 'Pricing page',
    sourceFile: 'pricing.html',
    resultFile: 'product.receipt.json',
    type: 'Product',
    hash: '8f4c1e…91d2',
    defaultPointer: '/price',
    command:
      'npx grounded-json from-jsonld pricing.html --type Product --schema product.schema.json --out receipt.json',
    evidence: {
      '/name': {
        field: 'name',
        value: 'Scale',
        quote: 'Scale',
        selector: '[data-plan="scale"] h3',
        hash: '32a1d0…9bc7',
        status: 'supported',
      },
      '/price': {
        field: 'price',
        value: 49,
        quote: '€49 / month',
        selector: '[data-plan="scale"] .price',
        hash: '104e7b…82a1',
        status: 'supported',
      },
      '/currency': {
        field: 'currency',
        value: 'EUR',
        quote: '€49 / month',
        selector: '[data-plan="scale"] .price',
        hash: '104e7b…82a1',
        status: 'supported',
      },
      '/billingPeriod': {
        field: 'billingPeriod',
        value: 'month',
        quote: '€49 / month',
        selector: '[data-plan="scale"] .price',
        hash: '104e7b…82a1',
        status: 'supported',
      },
      '/features/0': {
        field: '0',
        value: 'Unlimited projects',
        quote: 'Unlimited projects',
        selector: '[data-plan="scale"] li:nth-child(1)',
        hash: 'cb187e…51f4',
        status: 'supported',
      },
      '/features/1': {
        field: '1',
        value: 'Priority support',
        quote: 'Priority support',
        selector: '[data-plan="scale"] li:nth-child(2)',
        hash: 'eba43a…dc23',
        status: 'supported',
      },
      '/securityCertification': {
        field: 'securityCertification',
        value: null,
        quote: 'Enterprise-grade security',
        selector: '[data-plan="scale"] .security-note',
        hash: '971dda…303c',
        status: 'unsupported',
        explanation:
          '“Enterprise-grade” does not support the requested SOC 2 Type II claim.',
      },
    },
    json: [
      { type: 'raw', text: '{' },
      { type: 'field', pointer: '/name', display: '"Scale",', indent: 1 },
      { type: 'field', pointer: '/price', display: '49,', indent: 1 },
      { type: 'field', pointer: '/currency', display: '"EUR",', indent: 1 },
      {
        type: 'field',
        pointer: '/billingPeriod',
        display: '"month",',
        indent: 1,
      },
      { type: 'raw', text: '  "features": [' },
      {
        type: 'field',
        pointer: '/features/0',
        display: '"Unlimited projects",',
        indent: 2,
      },
      {
        type: 'field',
        pointer: '/features/1',
        display: '"Priority support"',
        indent: 2,
      },
      { type: 'raw', text: '  ],' },
      {
        type: 'field',
        pointer: '/securityCertification',
        display: 'null',
        indent: 1,
      },
      { type: 'raw', text: '}' },
    ],
  },
  job: {
    id: 'job',
    tab: 'Job posting',
    sourceFile: 'job.html',
    resultFile: 'job.receipt.json',
    type: 'JobPosting',
    hash: '41be77…c812',
    defaultPointer: '/title',
    command:
      'npx grounded-json from-jsonld job.html --type JobPosting --schema job.schema.json --out receipt.json',
    evidence: {
      '/title': {
        field: 'title',
        value: 'Senior TypeScript Engineer',
        quote: 'Senior TypeScript Engineer',
        selector: 'main h1',
        hash: 'ca9901…73ef',
        status: 'supported',
      },
      '/company': {
        field: 'company',
        value: 'Northwind Systems',
        quote: 'Northwind Systems',
        selector: '.company',
        hash: '41d70c…fc21',
        status: 'supported',
      },
      '/location': {
        field: 'location',
        value: 'Berlin, Germany',
        quote: 'Berlin, Germany',
        selector: '.location',
        hash: '57d33e…0b91',
        status: 'supported',
      },
      '/employmentType': {
        field: 'employmentType',
        value: 'FULL_TIME',
        quote: 'Full-time',
        selector: '.contract',
        hash: '2b7c42…e881',
        status: 'supported',
      },
      '/datePosted': {
        field: 'datePosted',
        value: '2026-08-28',
        quote: 'Posted 28 August 2026',
        selector: 'time',
        hash: 'f2d34b…75c0',
        status: 'supported',
      },
      '/salary': {
        field: 'salary',
        value: null,
        quote: 'Competitive compensation',
        selector: '.compensation',
        hash: '120bbe…fe09',
        status: 'unsupported',
        explanation:
          'The source does not support a concrete salary range, so strict mode rejects the candidate.',
      },
    },
    json: [
      { type: 'raw', text: '{' },
      {
        type: 'field',
        pointer: '/title',
        display: '"Senior TypeScript Engineer",',
        indent: 1,
      },
      {
        type: 'field',
        pointer: '/company',
        display: '"Northwind Systems",',
        indent: 1,
      },
      {
        type: 'field',
        pointer: '/location',
        display: '"Berlin, Germany",',
        indent: 1,
      },
      {
        type: 'field',
        pointer: '/employmentType',
        display: '"FULL_TIME",',
        indent: 1,
      },
      {
        type: 'field',
        pointer: '/datePosted',
        display: '"2026-08-28",',
        indent: 1,
      },
      { type: 'field', pointer: '/salary', display: 'null', indent: 1 },
      { type: 'raw', text: '}' },
    ],
  },
  article: {
    id: 'article',
    tab: 'Article',
    sourceFile: 'article.html',
    resultFile: 'article.receipt.json',
    type: 'Article',
    hash: 'd109ca…18af',
    defaultPointer: '/headline',
    command:
      'npx grounded-json from-jsonld article.html --type Article --schema article.schema.json --out receipt.json',
    evidence: {
      '/headline': {
        field: 'headline',
        value: 'Why evidence belongs beside data',
        quote: 'Why evidence belongs beside data',
        selector: 'article h1',
        hash: 'a51c99…d3e1',
        status: 'supported',
      },
      '/author': {
        field: 'author',
        value: 'Ada Brooks',
        quote: 'By Ada Brooks',
        selector: '.byline',
        hash: '182e83…106d',
        status: 'supported',
      },
      '/datePublished': {
        field: 'datePublished',
        value: '2026-09-01',
        quote: 'September 1, 2026',
        selector: 'time',
        hash: '70adae…f981',
        status: 'supported',
      },
      '/wordCount': {
        field: 'wordCount',
        value: 1842,
        quote: '1,842 words',
        selector: '.word-count',
        hash: 'cd1888…229a',
        status: 'supported',
      },
      '/section': {
        field: 'section',
        value: 'Data systems',
        quote: 'Data systems',
        selector: '.section',
        hash: 'a2d1c5…9a82',
        status: 'supported',
      },
      '/readingTime': {
        field: 'readingTime',
        value: null,
        quote: '1,842 words',
        selector: '.word-count',
        hash: 'cd1888…229a',
        status: 'unsupported',
        explanation:
          'Word count alone does not reproduce an exact reading time without a declared transform.',
      },
    },
    json: [
      { type: 'raw', text: '{' },
      {
        type: 'field',
        pointer: '/headline',
        display: '"Why evidence belongs beside data",',
        indent: 1,
      },
      {
        type: 'field',
        pointer: '/author',
        display: '"Ada Brooks",',
        indent: 1,
      },
      {
        type: 'field',
        pointer: '/datePublished',
        display: '"2026-09-01",',
        indent: 1,
      },
      { type: 'field', pointer: '/wordCount', display: '1842,', indent: 1 },
      {
        type: 'field',
        pointer: '/section',
        display: '"Data systems",',
        indent: 1,
      },
      { type: 'field', pointer: '/readingTime', display: 'null', indent: 1 },
      { type: 'raw', text: '}' },
    ],
  },
};

function SourceMark({
  pointers,
  selected,
  status,
  children,
}: {
  pointers: string[];
  selected: string;
  status?: EvidenceStatus;
  children: React.ReactNode;
}) {
  return (
    <mark
      data-active={pointers.includes(selected)}
      data-tone={status ?? 'supported'}
      className="source-mark"
    >
      {children}
    </mark>
  );
}

function JsonField({
  line,
  sample,
  selected,
  onSelect,
}: {
  line: Extract<JsonLine, { type: 'field' }>;
  sample: Sample;
  selected: string;
  onSelect: (pointer: string) => void;
}) {
  const item = sample.evidence[line.pointer]!;
  const unsupported = item.status === 'unsupported';
  return (
    <button
      type="button"
      onClick={() => onSelect(line.pointer)}
      aria-pressed={selected === line.pointer}
      className={`json-row ${selected === line.pointer ? 'json-row-active' : ''}`}
      style={{ paddingLeft: `${1.5 + (line.indent ?? 0) * 1.25}rem` }}
    >
      <span className="text-sky-300">&quot;{item.field}&quot;</span>
      <span className="text-slate-500">: </span>
      <span className="text-[#f8cf8b]">{line.display}</span>
      <span className="ml-auto inline-flex items-center gap-1.5 pl-3 text-xs">
        {unsupported ? (
          <>
            <CircleDot className="size-3.5 text-amber-400" />
            <span className="text-amber-300">unsupported</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-3.5 text-emerald-300" />
            <span className="text-emerald-200">source-backed</span>
          </>
        )}
      </span>
    </button>
  );
}

function SourceDocument({
  sampleId,
  selected,
}: {
  sampleId: SampleId;
  selected: string;
}) {
  if (sampleId === 'job') {
    return (
      <article className="source-document">
        <div className="source-nav">
          <strong>Northwind</strong>
          <span>Careers&nbsp;&nbsp; Teams&nbsp;&nbsp; About</span>
        </div>
        <p className="source-kicker">Engineering · Platform</p>
        <h2 className="source-heading">
          <SourceMark pointers={['/title']} selected={selected}>
            Senior TypeScript Engineer
          </SourceMark>
        </h2>
        <p className="mt-3 text-slate-600">
          Build dependable tools for teams that move important data.
        </p>
        <div className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-lg shadow-slate-900/6 sm:grid-cols-2">
          <p>
            <span className="source-label">Company</span>
            <SourceMark pointers={['/company']} selected={selected}>
              Northwind Systems
            </SourceMark>
          </p>
          <p>
            <span className="source-label">Location</span>
            <SourceMark pointers={['/location']} selected={selected}>
              Berlin, Germany
            </SourceMark>
          </p>
          <p>
            <span className="source-label">Contract</span>
            <SourceMark pointers={['/employmentType']} selected={selected}>
              Full-time
            </SourceMark>
          </p>
          <p>
            <span className="source-label">Published</span>
            <SourceMark pointers={['/datePosted']} selected={selected}>
              Posted 28 August 2026
            </SourceMark>
          </p>
        </div>
        <p className="compensation mt-6 text-sm text-slate-600">
          <SourceMark
            pointers={['/salary']}
            selected={selected}
            status="unsupported"
          >
            Competitive compensation
          </SourceMark>{' '}
          plus meaningful equity.
        </p>
      </article>
    );
  }
  if (sampleId === 'article') {
    return (
      <article className="source-document">
        <div className="source-nav">
          <strong>Signal / Journal</strong>
          <span>Research&nbsp;&nbsp; Systems&nbsp;&nbsp; Notes</span>
        </div>
        <p className="source-kicker">
          <SourceMark pointers={['/section']} selected={selected}>
            Data systems
          </SourceMark>
        </p>
        <h2 className="source-heading max-w-2xl">
          <SourceMark pointers={['/headline']} selected={selected}>
            Why evidence belongs beside data
          </SourceMark>
        </h2>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
          <span className="byline">
            <SourceMark pointers={['/author']} selected={selected}>
              By Ada Brooks
            </SourceMark>
          </span>
          <span>·</span>
          <time>
            <SourceMark pointers={['/datePublished']} selected={selected}>
              September 1, 2026
            </SourceMark>
          </time>
          <span>·</span>
          <span className="word-count">
            <SourceMark
              pointers={['/wordCount', '/readingTime']}
              selected={selected}
              status={selected === '/readingTime' ? 'unsupported' : 'supported'}
            >
              1,842 words
            </SourceMark>
          </span>
        </div>
        <div className="mt-9 max-w-2xl space-y-4 text-[15px] leading-7 text-slate-700">
          <p>
            A structured value without its source is cheap to produce and
            expensive to trust. Put the evidence beside the value and review
            becomes a deterministic operation.
          </p>
          <p>
            That shift turns extraction from a guessing game into an auditable
            handoff.
          </p>
        </div>
      </article>
    );
  }
  return (
    <article className="source-document">
      <div className="source-nav">
        <strong>Orbitbase</strong>
        <span>Product&nbsp;&nbsp; Pricing&nbsp;&nbsp; Docs</span>
      </div>
      <p className="source-kicker">Simple pricing</p>
      <h2 className="source-heading max-w-2xl">
        Ship your next idea without counting seats.
      </h2>
      <div
        data-plan="scale"
        className="mt-8 max-w-md rounded-2xl border-2 border-indigo-600 bg-white p-6 shadow-xl shadow-indigo-950/10"
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-slate-950">
            <SourceMark pointers={['/name']} selected={selected}>
              Scale
            </SourceMark>
          </h3>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            MOST POPULAR
          </span>
        </div>
        <p className="price mt-4 text-3xl font-bold text-slate-950">
          <SourceMark
            pointers={['/price', '/currency', '/billingPeriod']}
            selected={selected}
          >
            €49 / month
          </SourceMark>
        </p>
        <ul className="mt-6 space-y-3 text-sm text-slate-700">
          <li>
            <SourceMark pointers={['/features/0']} selected={selected}>
              Unlimited projects
            </SourceMark>
          </li>
          <li>
            <SourceMark pointers={['/features/1']} selected={selected}>
              Priority support
            </SourceMark>
          </li>
        </ul>
        <p className="security-note mt-6 text-sm text-slate-500">
          <SourceMark
            pointers={['/securityCertification']}
            selected={selected}
            status="unsupported"
          >
            Enterprise-grade security
          </SourceMark>
        </p>
      </div>
    </article>
  );
}

export function EvidenceWorkbench() {
  const [sampleId, setSampleId] = useState<SampleId>('pricing');
  const [selected, setSelected] = useState(samples.pricing.defaultPointer);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const sample = samples[sampleId];
  const item =
    sample.evidence[selected] ?? sample.evidence[sample.defaultPointer]!;
  const unsupported = item.status === 'unsupported';
  const supportedCount = Object.values(sample.evidence).filter(
    (entry) => entry.status === 'supported',
  ).length;
  const totalCount = Object.keys(sample.evidence).length;
  const ratio = Math.round((supportedCount / totalCount) * 100);

  useEffect(() => {
    const context =
      typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'select_evidence_field',
            title: 'Select evidence field',
            description:
              'Select one field in a grounded-json sample and reveal the same source evidence shown by the visible inspector.',
            inputSchema: {
              type: 'object',
              properties: {
                sample: { type: 'string', enum: ['pricing', 'job', 'article'] },
                pointer: {
                  type: 'string',
                  description:
                    'A JSON Pointer available in the selected sample.',
                },
              },
              required: ['sample', 'pointer'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              const selection = validateToolSelection(input);
              const nextSample = samples[selection.sample];
              const evidence = nextSample.evidence[selection.pointer];
              if (!evidence)
                throw new TypeError(`Unknown pointer for ${selection.sample}.`);
              flushSync(() => {
                setSampleId(selection.sample);
                setSelected(selection.pointer);
              });
              return {
                sample: selection.sample,
                pointer: selection.pointer,
                status:
                  evidence.status === 'supported'
                    ? 'source-backed'
                    : 'unsupported',
                quote: evidence.quote,
                selector: evidence.selector,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(reportWebMcpError);
    } catch (error) {
      reportWebMcpError(error);
    }
    return () => lifecycle.abort();
  }, []);

  function selectSample(next: string | null) {
    if (!isSampleId(next)) return;
    setSampleId(next);
    setSelected(samples[next].defaultPointer);
    setCopyState('idle');
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(sample.command);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1_500);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center border-b border-white/8 px-4 sm:px-7">
        <a
          href="#workbench"
          className="flex items-center gap-3"
          aria-label="grounded-json home"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-300/8 text-emerald-200 shadow-[0_0_28px_rgba(94,234,212,.12)]">
            <Braces className="size-4.5" />
          </span>
          <span className="font-mono text-[15px] font-semibold tracking-[-0.02em]">
            grounded<span className="text-emerald-300">.json</span>
          </span>
        </a>
        <nav
          className="ml-auto flex items-center gap-2 sm:gap-3"
          aria-label="Primary navigation"
        >
          <span className="hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/6 px-3 py-1.5 text-xs text-emerald-200 md:inline-flex">
            <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" />
            sample data · local interaction
          </span>
          <a
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            href="https://github.com/msertdev/grounded-json"
            target="_blank"
            rel="noreferrer"
          >
            <GitFork className="size-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </header>

      <section className="border-b border-white/8 bg-[#080d15] px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-[1560px] flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
              <ShieldCheck className="size-3.5" />
              Evidence inspector
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
              Extract structured data. Keep the proof.
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Every supported terminal can be replayed from its cited snapshot.
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2 xl:ml-auto">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-white/8 bg-black/30 px-3 py-2 font-mono text-xs text-slate-300 xl:w-[590px]">
              <span className="text-emerald-300">$</span> {sample.command}
            </code>
            <Button
              onClick={copyCommand}
              variant="outline"
              size="icon"
              aria-label="Copy command"
              className="border-white/10 bg-white/4"
            >
              {copyState === 'copied' ? (
                <Check className="text-emerald-300" />
              ) : (
                <Clipboard
                  className={copyState === 'failed' ? 'text-amber-300' : ''}
                />
              )}
            </Button>
          </div>
        </div>
      </section>

      <section id="workbench" className="mx-auto max-w-[1560px] p-4 sm:p-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={sampleId} onValueChange={selectSample}>
            <TabsList variant="line" className="gap-5">
              {(Object.values(samples) as Sample[]).map((entry) => (
                <TabsTrigger key={entry.id} value={entry.id} className="px-0">
                  {entry.tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-3 sm:ml-auto">
            <span className="text-sm text-slate-400">
              {supportedCount} of {totalCount} fields source-backed
            </span>
            <div
              className="h-1.5 w-28 overflow-hidden rounded-full bg-white/8"
              aria-label={`${ratio} percent evidence coverage`}
            >
              <div
                className="h-full rounded-full bg-emerald-300"
                style={{ width: `${ratio}%` }}
              />
            </div>
            <span className="font-mono text-xs text-emerald-200">{ratio}%</span>
          </div>
        </div>

        <div className="workbench-grid overflow-hidden rounded-2xl border border-white/9 bg-[#0a1019] shadow-[0_30px_100px_rgba(0,0,0,.28)]">
          <section
            className="min-w-0 border-b border-white/8 lg:border-r lg:border-b-0"
            aria-label="Source document"
          >
            <div className="panel-titlebar">
              <div className="flex items-center gap-2">
                <FileCode2 className="size-4 text-slate-400" />
                <span>SOURCE</span>
                <span className="text-slate-500">{sample.sourceFile}</span>
              </div>
              <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">
                SHA-256 · {sample.hash}
              </span>
            </div>
            <SourceDocument sampleId={sampleId} selected={selected} />
          </section>

          <section
            className="min-w-0"
            aria-label="Extracted JSON and field evidence"
          >
            <div className="panel-titlebar">
              <div className="flex items-center gap-2">
                <Braces className="size-4 text-emerald-300" />
                <span>DIAGNOSTIC RESULT</span>
                <span className="text-slate-500">{sample.resultFile}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-200">
                <CheckCircle2 className="size-3.5" />
                schema valid
              </span>
            </div>
            <div className="grid min-h-[570px] grid-rows-[1fr_auto]">
              <div className="overflow-auto py-5 font-mono text-[13px] leading-7 sm:text-sm">
                {sample.json.map((line, index) =>
                  line.type === 'raw' ? (
                    <div key={`${line.text}-${index}`} className="json-raw">
                      {line.text}
                    </div>
                  ) : (
                    <JsonField
                      key={line.pointer}
                      line={line}
                      sample={sample}
                      selected={selected}
                      onSelect={setSelected}
                    />
                  ),
                )}
              </div>
              <aside
                className="border-t border-white/8 bg-[#0c1420] p-5"
                aria-live="polite"
              >
                <div className="mb-4 flex items-start gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${unsupported ? 'bg-amber-300/10 text-amber-300' : 'bg-emerald-300/10 text-emerald-200'}`}
                  >
                    {unsupported ? (
                      <CircleDot className="size-4" />
                    ) : (
                      <Link2 className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">
                      {selected}
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-semibold ${unsupported ? 'text-amber-200' : 'text-emerald-100'}`}
                    >
                      {unsupported
                        ? 'Evidence cannot reproduce the requested value'
                        : 'Value is reproduced from source evidence'}
                    </p>
                  </div>
                  <span
                    className={`ml-auto rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${unsupported ? 'border-amber-300/25 bg-amber-300/8 text-amber-200' : 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200'}`}
                  >
                    {unsupported ? 'abstained' : 'source-backed'}
                  </span>
                </div>
                <blockquote className="rounded-xl border border-white/8 bg-black/25 p-3 text-sm text-slate-200">
                  “{item.quote}”
                </blockquote>
                {item.explanation && (
                  <p className="mt-3 text-xs leading-5 text-amber-200/85">
                    {item.explanation}
                  </p>
                )}
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Selector</dt>
                    <dd className="mt-1 truncate font-mono text-slate-300">
                      {item.selector}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Evidence hash</dt>
                    <dd className="mt-1 font-mono text-slate-300">
                      {item.hash}
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <CircleDot className="size-4 text-amber-300" />
            <span>
              <strong className="font-medium text-slate-200">
                {totalCount - supportedCount} requested field abstained.
              </strong>{' '}
              Strict mode rejects this candidate; the diagnostic keeps the
              abstention visible.
            </span>
          </div>
          <a
            href="#method"
            className="inline-flex items-center gap-1.5 text-emerald-200 sm:ml-auto"
          >
            How replay works <ChevronRight className="size-4" />
          </a>
        </div>
      </section>

      <section
        id="method"
        className="border-y border-white/8 bg-[#080d15] px-4 py-16 sm:px-7"
      >
        <div className="mx-auto max-w-[1200px]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
            A small, hard trust boundary
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            The source can be messy. The verdict stays deterministic.
          </h2>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            <article className="method-card">
              <span>01</span>
              <h3>Snapshot</h3>
              <p>
                Bind exact local source bytes with SHA-256. Source embedding
                stays opt-in.
              </p>
            </article>
            <article className="method-card">
              <span>02</span>
              <h3>Replay</h3>
              <p>
                Find each anchor again and run only declared, allowlisted
                transforms.
              </p>
            </article>
            <article className="method-card">
              <span>03</span>
              <h3>Abstain</h3>
              <p>
                Missing, duplicated, or mismatched evidence becomes an issue—not
                a confidence score.
              </p>
            </article>
          </div>
          <div className="mt-8 grid gap-4 rounded-2xl border border-white/9 bg-[#0b121c] p-5 lg:grid-cols-[1fr_1.25fr] lg:p-7">
            <div>
              <h3 className="text-lg font-semibold">Local-only by design</h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
                v0.1 does not fetch URLs, execute HTML, load code schemas, run a
                browser, or send telemetry. Save a page you are allowed to
                process and keep acquisition outside the verifier.
              </p>
            </div>
            <pre className="overflow-auto rounded-xl border border-white/8 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-300">
              <span className="text-emerald-300">$</span> npx grounded-json demo
              {`\n`}
              <span className="text-emerald-300">PASS</span> 4/4 fields are
              source-backed{`\n\n`}
              <span className="text-slate-500"># replay later</span>
              {`\n`}
              <span className="text-emerald-300">$</span> grounded-json verify
              receipt.json page.html
            </pre>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            <strong className="text-slate-300">Important:</strong> evidence
            supports provenance, not factual truth, authorship, publication
            time, or legal compliance.
          </p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1560px] flex-col gap-3 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-7">
        <span>MIT licensed · TypeScript · Node.js 22+</span>
        <span className="hidden sm:inline">·</span>
        <span>Built for auditable agent and data workflows</span>
        <a
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-emerald-200 sm:ml-auto"
          href="https://github.com/msertdev/grounded-json"
          target="_blank"
          rel="noreferrer"
        >
          Read the source <ExternalLink className="size-3" />
        </a>
      </footer>
    </main>
  );
}

function isSampleId(value: unknown): value is SampleId {
  return value === 'pricing' || value === 'job' || value === 'article';
}

function validateToolSelection(input: unknown): {
  sample: SampleId;
  pointer: string;
} {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be an object.');
  }
  const keys = Object.keys(input);
  if (
    keys.length !== 2 ||
    !keys.includes('sample') ||
    !keys.includes('pointer')
  ) {
    throw new TypeError('Input must contain only sample and pointer.');
  }
  const sample = (input as { sample?: unknown }).sample;
  const pointer = (input as { pointer?: unknown }).pointer;
  if (!isSampleId(sample) || typeof pointer !== 'string') {
    throw new TypeError('sample or pointer is invalid.');
  }
  return { sample, pointer };
}

function reportWebMcpError(error: unknown) {
  console.warn('WebMCP registration failed.', error);
}
