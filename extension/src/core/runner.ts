import { computePercentile, evaluateAssertions, exportBatchMarkdown, exportJUnitXml } from './runner-reports';
import {
  BatchReport,
  BatchRowResult,
  ParseError,
  RequestSpec,
} from './types';

export { exportBatchMarkdown, exportJUnitXml };

export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const text = csvText.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const records: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      currentRow.push(field);
      records.push(currentRow);
      currentRow = [];
      field = '';
    } else if (ch === '\n') {
      currentRow.push(field);
      records.push(currentRow);
      currentRow = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    throw new ParseError('Unclosed quote in CSV input.', 'INVALID_HTTP_SYNTAX', {
      details: 'RFC 4180 CSV parser detected an unclosed double-quoted field.',
    });
  }
  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field);
    records.push(currentRow);
  }
  if (records.length <= 1) return [];

  const headers = records[0].map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length === 1 && rec[0] === '') continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) {
        Object.defineProperty(obj, headers[c], {
          value: rec[c] ?? '',
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    rows.push(obj);
  }
  return rows;
}

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).trim();
    const envKey = key.startsWith('$dotenv ') ? key.slice('$dotenv '.length).trim() : key;
    return Object.prototype.hasOwnProperty.call(vars, envKey) ? vars[envKey] : match;
  });
}

async function executeOne(
  req: RequestSpec,
  rowIndex: number,
  vars: Record<string, string>,
  timeoutMs: number,
  fetchFn: typeof fetch
): Promise<BatchRowResult> {
  const baseUrl = substituteVars(req.url, vars);
  const queryParts = req.query.map((q) => {
    const k = encodeURIComponent(substituteVars(q.key, vars));
    const v = encodeURIComponent(substituteVars(q.value, vars));
    return `${k}=${v}`;
  });

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = substituteVars(v, vars);
  }
  const hasHeader = (name: string): boolean =>
    Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());

  if (req.auth && req.auth.type !== 'none') {
    if (req.auth.type === 'bearer' && !hasHeader('authorization')) {
      headers.Authorization = `Bearer ${substituteVars(req.auth.token || '', vars)}`;
    } else if (req.auth.type === 'basic' && !hasHeader('authorization')) {
      const creds = `${substituteVars(req.auth.username || '', vars)}:${substituteVars(req.auth.password || '', vars)}`;
      headers.Authorization = `Basic ${Buffer.from(creds, 'utf8').toString('base64')}`;
    } else if (req.auth.type === 'apikey') {
      const k = substituteVars(req.auth.key || 'X-Api-Key', vars);
      const v = substituteVars(req.auth.value || '', vars);
      if (req.auth.in === 'query') queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      else if (!hasHeader(k)) headers[k] = v;
    }
  }

  const finalUrl =
    queryParts.length > 0 ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryParts.join('&')}` : baseUrl;

  let reqBody: string | FormData | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && req.body.mode !== 'none') {
    if (req.body.mode === 'formdata' && req.body.raw === undefined) {
      const fd = new FormData();
      for (const f of req.body.fields || []) {
        const k = substituteVars(f.key, vars);
        const v = substituteVars(f.value, vars);
        if (f.type === 'file') fd.append(k, new Blob([v], { type: 'application/octet-stream' }), v || 'upload.bin');
        else fd.append(k, v);
      }
      reqBody = fd;
      for (const hk of Object.keys(headers)) {
        if (hk.toLowerCase() === 'content-type' && !headers[hk].includes('boundary=')) delete headers[hk];
      }
    } else {
      if (req.body.raw !== undefined) reqBody = substituteVars(req.body.raw, vars);
      if (req.body.contentType && !hasHeader('content-type')) headers['Content-Type'] = req.body.contentType;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchFn(finalUrl, {
      method: req.method,
      headers,
      body: reqBody,
      signal: controller.signal,
    });
    const bodyText = await res.text();
    const latencyMs = Date.now() - started;
    const assertions = evaluateAssertions(req.tests, res.status, bodyText);
    const passed = assertions.every((a) => a.passed);
    return { rowIndex, requestId: req.id, requestName: req.name, method: req.method, url: finalUrl, status: res.status, latencyMs, passed, assertions };
  } catch (err) {
    return {
      rowIndex,
      requestId: req.id,
      requestName: req.name,
      method: req.method,
      url: finalUrl,
      status: 0,
      latencyMs: Date.now() - started,
      passed: false,
      assertions: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runBatch(
  requests: RequestSpec[],
  rows: Array<Record<string, string>>,
  env: Record<string, string>,
  opts?: { concurrency?: number; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<BatchReport> {
  const started = Date.now();
  const concurrency = Math.max(1, opts?.concurrency ?? 5);
  const timeoutMs = Math.max(50, opts?.timeoutMs ?? 15000);
  const fetchFn = opts?.fetchImpl ?? globalThis.fetch;

  const tasks: Array<{ rowIndex: number; req: RequestSpec; vars: Record<string, string> }> = [];
  rows.forEach((row, rowIndex) => {
    const merged = { ...env, ...row };
    for (const req of requests) tasks.push({ rowIndex, req, vars: merged });
  });

  const results: BatchRowResult[] = new Array(tasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const t = tasks[idx];
      results[idx] = await executeOne(t.req, t.rowIndex, t.vars, timeoutMs, fetchFn);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const passedCount = results.filter((r) => r.passed).length;
  return {
    totalRows: rows.length,
    totalRequests: requests.length,
    totalExecutions: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    minLatencyMs: latencies[0] ?? 0,
    maxLatencyMs: latencies[latencies.length - 1] ?? 0,
    p50LatencyMs: computePercentile(latencies, 50),
    p95LatencyMs: computePercentile(latencies, 95),
    durationMs: Date.now() - started,
    results,
  };
}
