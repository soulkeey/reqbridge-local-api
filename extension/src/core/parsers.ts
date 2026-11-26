import { parseBrunoDirectory, parseSingleBru } from './parsers-bruno';
import { looksLikeCurl, parseCurlCommand } from './parsers-curl';
import { looksLikeOpenApiYaml, parseOpenApiSpec } from './parsers-openapi';
import { makeRequestId, parseHttpFile, parseThunderCollection, splitUrlAndQuery } from './parsers-thunder-http';
import { AuthSpec, BodySpec, CollectionSpec, HintFormat, ParseError, QueryParam, RequestSpec, SourceFormat } from './types';

export { parseBrunoDirectory, ParseError };

const BRU_BLOCK_RE =
  /^(?:meta|get|post|put|patch|delete|head|options|headers|query|params:query|params:path|body(?::[a-z0-9-]+)?|auth(?::[a-z0-9-]+)?|vars(?::[a-z0-9-]+)?|tests|assert)\s*\{/m;
const HTTP_LINE_RE = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/m;

function kvArrayToMap(arr: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(arr)) return out;
  for (const entry of arr) {
    if (entry && typeof entry === 'object' && entry.key) {
      out[String(entry.key)] = String(entry.value ?? '');
    }
  }
  return out;
}

function parsePostmanAuth(raw: Record<string, unknown> | undefined): AuthSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = String(raw.type || '').toLowerCase();
  if (type === 'noauth' || type === 'none') return { type: 'none' };
  if (type === 'bearer') {
    const kv = kvArrayToMap(raw.bearer);
    return { type: 'bearer', token: kv.token ?? '{{token}}' };
  }
  if (type === 'apikey') {
    const kv = kvArrayToMap(raw.apikey);
    return {
      type: 'apikey',
      key: kv.key || 'X-Api-Key',
      value: kv.value ?? '{{apiKey}}',
      in: kv.in === 'query' ? 'query' : 'header',
    };
  }
  if (type === 'basic') {
    const kv = kvArrayToMap(raw.basic);
    return {
      type: 'basic',
      username: kv.username ?? '',
      password: kv.password ?? '',
    };
  }
  return undefined;
}

function parsePostmanUrl(rawUrl: unknown): { baseUrl: string; query: QueryParam[] } {
  if (typeof rawUrl === 'string') return splitUrlAndQuery(rawUrl);
  if (!rawUrl || typeof rawUrl !== 'object') return { baseUrl: '{{baseUrl}}/', query: [] };
  const obj = rawUrl as Record<string, unknown>;
  let baseStr = '';
  if (typeof obj.raw === 'string' && obj.raw.trim()) {
    baseStr = obj.raw.trim();
  } else {
    const proto = typeof obj.protocol === 'string' ? `${obj.protocol}://` : '';
    const host = Array.isArray(obj.host) ? obj.host.join('.') : String(obj.host || '');
    const port = obj.port !== undefined && obj.port !== null && String(obj.port).trim() ? `:${String(obj.port).trim()}` : '';
    const rawPath = Array.isArray(obj.path) ? obj.path.join('/') : String(obj.path || '').replace(/^\/+/, '');
    const path = rawPath ? `/${rawPath}` : '';
    baseStr = `${proto}${host}${port}${path}`;
  }
  const split = splitUrlAndQuery(baseStr);
  if (Array.isArray(obj.query)) {
    const structured: QueryParam[] = [];
    for (const q of obj.query) {
      if (q && typeof q === 'object' && !q.disabled && q.key) {
        structured.push({ key: String(q.key), value: String(q.value ?? '') });
      }
    }
    return { baseUrl: split.baseUrl, query: structured };
  }
  return split;
}

function parsePostmanBody(
  body: Record<string, unknown> | undefined,
  headers: Record<string, string>
): BodySpec | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const mode = String(body.mode || 'none').toLowerCase();
  const ctHeader = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1];

  if (mode === 'raw' && typeof body.raw === 'string') {
    const lang = (body.options as Record<string, Record<string, unknown>> | undefined)?.raw?.language;
    const inferredCt =
      lang === 'json'
        ? 'application/json'
        : lang === 'xml'
          ? 'application/xml'
          : lang === 'text'
            ? 'text/plain'
            : undefined;
    return { mode: 'raw', raw: body.raw, contentType: ctHeader || inferredCt };
  }
  if (mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
    const fields = body.urlencoded
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object' && !p.disabled && p.key))
      .map((p) => ({ key: String(p.key), value: String(p.value ?? '') }));
    return {
      mode: 'urlencoded',
      contentType: ctHeader || 'application/x-www-form-urlencoded',
      fields,
      raw: fields.map((f) => `${f.key}=${f.value}`).join('&'),
    };
  }
  if (mode === 'formdata' && Array.isArray(body.formdata)) {
    const fields = body.formdata
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object' && !p.disabled && p.key))
      .map((p) => ({
        key: String(p.key),
        value: String(p.type === 'file' ? p.src ?? '' : p.value ?? ''),
        type: (p.type === 'file' ? 'file' : 'text') as 'text' | 'file',
      }));
    return { mode: 'formdata', contentType: ctHeader || 'multipart/form-data', fields };
  }
  return undefined;
}

function parsePostmanCollection(obj: Record<string, unknown>): CollectionSpec {
  if (!Array.isArray(obj.item)) {
    throw new ParseError(
      'Postman Collection v2.1 JSON must include an item array.',
      'INVALID_POSTMAN_SCHEMA',
      { format: 'postman' }
    );
  }

  const variables: Record<string, string> = {};
  if (Array.isArray(obj.variable)) {
    for (const v of obj.variable) {
      if (v && typeof v === 'object' && v.key && !v.disabled) {
        variables[String(v.key)] = String(v.value ?? '');
      }
    }
  }

  const requests: RequestSpec[] = [];
  const warnings: string[] = [];
  const rootAuth = parsePostmanAuth(obj.auth as Record<string, unknown> | undefined);

  function walk(items: unknown[], parentAuth: AuthSpec | undefined, folders: string[]): void {
    for (const node of items) {
      if (!node || typeof node !== 'object') continue;
      const rec = node as Record<string, unknown>;
      const folderAuth = parsePostmanAuth(rec.auth as Record<string, unknown> | undefined) ?? parentAuth;
      if (Array.isArray(rec.item)) {
        walk(rec.item, folderAuth, [...folders, String(rec.name || 'Folder')]);
        continue;
      }
      if (!rec.request || typeof rec.request !== 'object') continue;

      const req = rec.request as Record<string, unknown>;
      const method = String(req.method || 'GET').toUpperCase();
      const { baseUrl, query } = parsePostmanUrl(req.url);
      const headers: Record<string, string> = {};
      if (Array.isArray(req.header)) {
        for (const h of req.header) {
          if (h && typeof h === 'object' && !h.disabled && h.key) {
            headers[String(h.key)] = String(h.value ?? '');
          }
        }
      }

      const explicitAuth = parsePostmanAuth(req.auth as Record<string, unknown> | undefined);
      const effectiveAuth = explicitAuth ?? folderAuth;
      const inheritedAuth = !explicitAuth && Boolean(folderAuth && folderAuth.type !== 'none');

      const tests: string[] = [];
      if (Array.isArray(rec.event)) {
        for (const ev of rec.event) {
          if (!ev || typeof ev !== 'object') continue;
          const exec = (ev.script as Record<string, unknown> | undefined)?.exec;
          const lines = Array.isArray(exec) ? exec.map((l) => String(l).trim()).filter(Boolean) : [];
          if (ev.listen === 'test') tests.push(...lines);
          else if (ev.listen === 'prerequest' && lines.length > 0) {
            warnings.push(`Pre-request script detected on "${String(rec.name || method)}": review manually or use BYOK.`);
          }
        }
      }

      const name = String(rec.name || `${method} ${baseUrl}`);
      requests.push({
        id: makeRequestId(name, requests.length),
        name,
        folder: folders,
        method,
        url: baseUrl || '/',
        headers,
        query,
        body: parsePostmanBody(req.body as Record<string, unknown> | undefined, headers),
        auth: effectiveAuth,
        tests,
        sourceFormat: 'postman',
        inheritedAuth,
      });
    }
  }

  walk(obj.item, rootAuth, []);
  const info = obj.info as Record<string, unknown> | undefined;
  return {
    name: String(info?.name || 'Postman Collection'),
    baseUrl: variables.baseUrl || variables.base_url,
    variables,
    requests,
    warnings,
  };
}

export function parseInputCollection(rawText: string, hintFormat: HintFormat = 'auto'): CollectionSpec {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    throw new ParseError('Input collection text is empty.', 'EMPTY_INPUT', { format: hintFormat });
  }

  let detected: SourceFormat;
  let parsedJson: Record<string, unknown> | null = null;

  if (
    hintFormat === 'postman' ||
    hintFormat === 'thunder' ||
    ((hintFormat === 'auto' || hintFormat === 'openapi') && /^[{\[]/.test(cleaned))
  ) {
    try {
      const val: unknown = JSON.parse(cleaned);
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        throw new ParseError('Expected a JSON object for Postman, Thunder, or OpenAPI collection.', 'INVALID_JSON', {
          format: hintFormat,
        });
      }
      parsedJson = val as Record<string, unknown>;
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw new ParseError(
        `Invalid JSON input: ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_JSON',
        { format: hintFormat }
      );
    }

    if (hintFormat === 'postman') detected = 'postman';
    else if (hintFormat === 'thunder') detected = 'thunder';
    else if (hintFormat === 'openapi') detected = 'openapi';
    else if (Array.isArray(parsedJson.item)) detected = 'postman';
    else if (Array.isArray(parsedJson.requests)) detected = 'thunder';
    else if ((parsedJson.openapi || parsedJson.swagger) && parsedJson.paths) detected = 'openapi';
    else {
      throw new ParseError(
        'Unrecognized JSON schema: expected Postman (item[]), Thunder Client (requests[]), or OpenAPI (paths).',
        'UNSUPPORTED_FORMAT',
        { format: hintFormat }
      );
    }
  } else if (hintFormat === 'openapi' || (hintFormat === 'auto' && looksLikeOpenApiYaml(cleaned))) {
    detected = 'openapi';
  } else if (hintFormat === 'curl' || (hintFormat === 'auto' && looksLikeCurl(cleaned))) {
    detected = 'curl';
  } else if (hintFormat === 'bruno') {
    detected = 'bruno';
  } else if (hintFormat === 'http') {
    detected = 'http';
  } else if (BRU_BLOCK_RE.test(cleaned)) {
    detected = 'bruno';
  } else if (HTTP_LINE_RE.test(cleaned) || /^###/m.test(cleaned) || /^@[A-Za-z0-9_.-]+\s*=/m.test(cleaned)) {
    detected = 'http';
  } else {
    throw new ParseError(
      'Unable to detect input format (expected Postman, Thunder Client, Bruno .bru, .http, OpenAPI YAML/JSON, or cURL).',
      'UNSUPPORTED_FORMAT',
      { format: hintFormat }
    );
  }

  if (detected === 'postman') return parsePostmanCollection(parsedJson!);
  if (detected === 'thunder') return parseThunderCollection(parsedJson!);
  if (detected === 'openapi') return parseOpenApiSpec(parsedJson ?? cleaned);
  if (detected === 'curl') return parseCurlCommand(cleaned);
  if (detected === 'http') return parseHttpFile(cleaned);
  const { request } = parseSingleBru(cleaned);
  return { name: request.name, variables: {}, requests: [request], warnings: [] };
}
