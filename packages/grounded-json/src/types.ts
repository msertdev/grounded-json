export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SourceMediaType = 'text/html' | 'text/plain';

export interface SourceInput {
  content: string;
  mediaType: SourceMediaType;
  id?: string;
  url?: string;
  retrievedAt?: string;
}

export interface SourceSnapshot {
  id: string;
  mediaType: SourceMediaType;
  contentHash: `sha256:${string}`;
  bytes: number;
  url?: string;
  retrievedAt?: string;
  /** Present only when the caller explicitly chooses an embedded receipt. */
  content?: string;
}

export type NormalizerName =
  | 'trim'
  | 'lowercase'
  | 'parse-number'
  | 'currency-code'
  | 'iso-date'
  | 'boolean'
  | 'json-decode';

export interface EvidenceClaim {
  /** RFC 6901 JSON Pointer to a leaf value in the candidate data. */
  pointer: string;
  /** Exact excerpt that must be present at the anchor. */
  quote: string;
  /** Optional exact substring of quote used as normalizer input. */
  match?: string;
  /** Optional CSS selector. Only accepted for HTML sources. */
  selector?: string;
  /** Zero-based match when a selector intentionally resolves more than once. */
  selectorIndex?: number;
  /** Read an attribute instead of the selected element's text content. */
  attribute?: string;
  /** Deterministic normalization operations, replayed in order. */
  transforms?: NormalizerName[];
  /** Source id. May be omitted when exactly one source is supplied. */
  sourceId?: string;
}

export type EvidenceStatus = 'grounded' | 'missing' | 'ambiguous' | 'invalid';

export interface EvidenceRecord extends EvidenceClaim {
  sourceId: string;
  sourceHash: `sha256:${string}`;
  status: EvidenceStatus;
  observedValue?: JsonValue;
  reason?: string;
}

export type IssueCode =
  | 'missing-evidence'
  | 'pointer-not-found'
  | 'source-not-found'
  | 'quote-not-found'
  | 'ambiguous-anchor'
  | 'selector-invalid'
  | 'selector-not-found'
  | 'selector-index-out-of-range'
  | 'attribute-not-found'
  | 'match-not-in-quote'
  | 'normalization-failed'
  | 'value-mismatch'
  | 'source-hash-mismatch'
  | 'receipt-hash-mismatch'
  | 'verification-mismatch'
  | 'schema-invalid';

export interface GroundingIssue {
  code: IssueCode;
  pointer?: string;
  sourceId?: string;
  message: string;
}

export interface CoverageSummary {
  grounded: number;
  total: number;
  missing: number;
  ambiguous: number;
  invalid: number;
  ratio: number;
}

export interface ReceiptManifest {
  format: 'grounded-json/receipt';
  version: 1;
  createdAt: string;
  receiptHash: `sha256:${string}`;
}

export interface PortableSchemaSnapshot {
  dialect: 'https://json-schema.org/draft/2020-12/schema';
  subset: 'grounded-json/safe-v1';
  document: JsonValue;
  contentHash: `sha256:${string}`;
}

export interface GroundedReceipt<T extends JsonValue = JsonValue> {
  manifest: ReceiptManifest;
  data: T;
  /** Included only for the declarative, portable JSON Schema path. */
  schema?: PortableSchemaSnapshot;
  sources: SourceSnapshot[];
  evidence: Record<string, EvidenceRecord[]>;
  issues: GroundingIssue[];
  coverage: CoverageSummary;
}

export interface GroundOptions {
  /** Include source bytes in the receipt. Off by default to reduce data leakage. */
  embedSources?: boolean;
  /** Throw unless every non-null leaf has grounded evidence. */
  strict?: boolean;
  /** Stable clock injection for tests and reproducible builds. */
  now?: () => Date;
}

export interface ReceiptVerification {
  ok: boolean;
  issues: GroundingIssue[];
  coverage: CoverageSummary;
}

export interface SelectorRule {
  selector: string;
  selectorIndex?: number;
  attribute?: string;
  match?: string;
  transforms?: NormalizerName[];
}

export type SelectorMap = Record<string, SelectorRule>;
