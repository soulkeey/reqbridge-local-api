export type SourceFormat = 'postman' | 'thunder' | 'bruno' | 'http' | 'openapi' | 'curl';
export type HintFormat = 'auto' | SourceFormat;

export interface AuthSpec {
  type: 'none' | 'bearer' | 'apikey' | 'basic';
  token?: string;
  key?: string;
  value?: string;
  in?: 'header' | 'query';
  username?: string;
  password?: string;
}

export interface BodyField {
  key: string;
  value: string;
  type?: 'text' | 'file';
}

export interface BodySpec {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'none';
  raw?: string;
  contentType?: string;
  fields?: BodyField[];
}

export interface QueryParam {
  key: string;
  value: string;
}

export interface RequestSpec {
  id: string;
  name: string;
  folder: string[];
  method: string;
  url: string;
  headers: Record<string, string>;
  query: QueryParam[];
  body?: BodySpec;
  auth?: AuthSpec;
  tests: string[];
  sourceFormat: SourceFormat;
  inheritedAuth?: boolean;
}

export interface CollectionSpec {
  name: string;
  baseUrl?: string;
  variables: Record<string, string>;
  requests: RequestSpec[];
  warnings: string[];
}

export type ParseErrorCode =
  | 'EMPTY_INPUT'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_POSTMAN_SCHEMA'
  | 'INVALID_THUNDER_SCHEMA'
  | 'INVALID_BRU_SYNTAX'
  | 'INVALID_HTTP_SYNTAX'
  | 'INVALID_OPENAPI_SCHEMA'
  | 'INVALID_CURL_SYNTAX';

export class ParseError extends Error {
  readonly code: ParseErrorCode;
  readonly format?: HintFormat;
  readonly line?: number;
  readonly details?: string;

  constructor(
    message: string,
    code: ParseErrorCode,
    opts?: { format?: HintFormat; line?: number; details?: string }
  ) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.format = opts?.format;
    this.line = opts?.line;
    this.details = opts?.details;
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export interface ResponseSample {
  status: number;
  latencyMs: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
}

export interface BatchAssertionResult {
  expression: string;
  passed: boolean;
  detail?: string;
}

export interface BatchRowResult {
  rowIndex: number;
  requestId: string;
  requestName: string;
  method: string;
  url: string;
  status: number;
  latencyMs: number;
  passed: boolean;
  assertions: BatchAssertionResult[];
  error?: string;
}

export interface BatchReport {
  totalRows: number;
  totalRequests: number;
  totalExecutions: number;
  passedCount: number;
  failedCount: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  durationMs: number;
  results: BatchRowResult[];
}

export type DiffSeverity = 'breaking' | 'warning' | 'non-breaking' | 'info';
export type DiffKind =
  | 'status_drift'
  | 'latency_delta'
  | 'missing_key'
  | 'added_key'
  | 'type_shift'
  | 'value_mismatch'
  | 'body_parse_error';

export interface DiffEntry {
  kind: DiffKind;
  severity: DiffSeverity;
  path: string;
  message: string;
  stagingValue?: unknown;
  prodValue?: unknown;
}

export interface DiffReport {
  endpoint: string;
  statusMatch: boolean;
  stagingStatus: number;
  prodStatus: number;
  latencyDeltaMs: number;
  hasBreakingChanges: boolean;
  summary: string;
  entries: DiffEntry[];
}

export type LicenseTier = 'free' | 'personal' | 'team';
export type LicenseProvider = 'none' | 'offline-ed25519' | 'creem' | 'gumroad';

export interface LicenseLimits {
  migrationUnlimited: boolean;
  singleRequestUnlimited: boolean;
  singleEndpointDiffUnlimited: boolean;
  maxBatchCsvRows: number | null;
  maxBatchRunsPerDay: number | null;
  collectionWideDiff: boolean;
  ciExport: boolean;
  byok: boolean;
}

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  provider: LicenseProvider;
  seats: number;
  maxDevices: number;
  expiresAt?: string;
  licenseId?: string;
  message: string;
  limits: LicenseLimits;
}

export interface TrialUsageState {
  date: string;
  batchRunsToday: number;
}

export interface TrialAllowanceResult {
  allowed: boolean;
  reason?: string;
  remainingRunsToday: number | null;
  nextUsage: TrialUsageState;
}

export interface OfflineLicensePayload {
  v: 1;
  plan: 'personal' | 'team';
  seats: number;
  maxDevices: number;
  id: string;
  iat: string;
  exp?: string;
  machineLock?: string;
}

export interface VerifyLicenseOptions {
  onlineVerify?: boolean;
  provider?: 'creem' | 'gumroad';
  apiBaseUrl?: string;
  apiKey?: string;
  instanceId?: string;
  productId?: string;
  testMode?: boolean;
  publicKeyPem?: string;
  nowMs?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ByokProvider = 'openai' | 'openai-compatible' | 'gemini';

export interface ByokOptions {
  provider: ByokProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  target?: 'http-assert' | 'node-test';
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ByokTranslationResult {
  assertions: string[];
  rawOutput: string;
  model: string;
  provider: ByokProvider;
}
