import { CollectionSpec, RequestSpec } from './types';

const quoteYaml = (s: string): string =>
  JSON.stringify(s).replace(/[\u0085\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
function yamlScalar(val: unknown): string {
  if (val === null) return 'null';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  const str = String(val);
  if (
    str === '' || str === '=' || str === '<<' || str === '...' ||
    /^(?:true|false|null|yes|no|on|off|y|n|~|[+-]?\.inf|\.nan)$/i.test(str) ||
    /^[+-]?(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?$/.test(str) ||
    /^[+-]?0[xXoObB][0-9a-fA-F_]+$/.test(str) ||
    /^\d{4}-\d{1,2}-\d{1,2}(?:[Tt ]\d|$)/.test(str) ||
    /^[-?]/.test(str) ||
    /[:#{}[\],&*!|>'"%@`\\\n\r\x00-\x1f\x7f\u0085\u2028\u2029]/.test(str) ||
    /^\s|\s$/.test(str)
  ) {
    return quoteYaml(str);
  }
  return str;
}

function yamlKey(k: string): string {
  if (
    /^[A-Za-z_/][A-Za-z0-9_./{}-]*$/.test(k) &&
    !/^(?:true|false|null|yes|no|on|off|y|n)$/i.test(k)
  ) {
    return k;
  }
  return quoteYaml(k);
}

function toYamlLines(val: unknown, indent = 0): string[] {
  const pad = ' '.repeat(indent);
  if (Array.isArray(val)) {
    if (val.length === 0) return [`${pad}[]`];
    const lines: string[] = [];
    for (const item of val) {
      if (item !== null && typeof item === 'object') {
        const sub = toYamlLines(item, indent + 2);
        if (sub.length > 0) {
          lines.push(`${pad}- ${sub[0].trimStart()}`);
          lines.push(...sub.slice(1));
        } else {
          lines.push(`${pad}- {}`);
        }
      } else {
        lines.push(`${pad}- ${yamlScalar(item)}`);
      }
    }
    return lines;
  }
  if (val !== null && typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return [`${pad}{}`];
    const lines: string[] = [];
    for (const [k, v] of entries) {
      const keyStr = yamlKey(k);
      if (v !== null && typeof v === 'object') {
        const isEmpty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
        if (isEmpty) {
          lines.push(`${pad}${keyStr}: ${Array.isArray(v) ? '[]' : '{}'}`);
        } else {
          lines.push(`${pad}${keyStr}:`);
          lines.push(...toYamlLines(v, indent + 2));
        }
      } else {
        lines.push(`${pad}${keyStr}: ${yamlScalar(v)}`);
      }
    }
    return lines;
  }
  return [`${pad}${yamlScalar(val)}`];
}

function normalizeOpenApiPath(rawUrl: string): string {
  let p = rawUrl
    .split('?')[0]
    .trim()
    .replace(/^(?:https?|\{\{[^}]+\}\}):\/\/[^/?#]+/i, '')
    .replace(/^(?:[A-Za-z0-9_.-]+|\{\{[^}]+\}\}):(?:\d+|\{\{[^}]+\}\})(?=\/|$)/, '')
    .replace(/^\{\{[^}]+\}\}/, '');
  p = p.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, '{$1}');
  p = p.replace(/(^|\/):([A-Za-z_][A-Za-z0-9_-]*)/g, '$1{$2}');
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

function inferJsonSchema(val: unknown): Record<string, unknown> {
  if (val === null) return { type: 'null' };
  if (Array.isArray(val)) {
    return {
      type: 'array',
      items: val.length > 0 ? inferJsonSchema(val[0]) : { type: 'string' },
    };
  }
  if (typeof val === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      properties[k] = inferJsonSchema(v);
    }
    return { type: 'object', properties };
  }
  if (typeof val === 'number') {
    return { type: Number.isInteger(val) ? 'integer' : 'number' };
  }
  if (typeof val === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

function parseTemplatedJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        out += ch;
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
        out += ch;
      } else if (ch === '{' && raw[i + 1] === '{') {
        const close = raw.indexOf('}}', i + 2);
        if (close !== -1) {
          out += '"placeholder"';
          i = close + 1;
          continue;
        }
        out += ch;
      } else {
        out += ch;
      }
    }
    try {
      return JSON.parse(out);
    } catch {
      return undefined;
    }
  }
}

function inferStatusCodes(tests: string[]): string[] {
  const codes = new Set<string>();
  for (const t of tests) {
    const matches = t.matchAll(
      /(?:have\.status\(\s*(\d{3})\s*\)|(?<!\.)status\s*===?\s*(\d{3})|res\.status:?\s*eq\s*(\d{3})|(?:getStatus\(\)|res\.status)\)?\.to\.(?:equal|eql)\(\s*(\d{3})\s*\))/gi
    );
    for (const m of matches) {
      const code = m[1] || m[2] || m[3] || m[4];
      if (code) codes.add(code);
    }
  }
  return codes.size > 0 ? [...codes] : ['200'];
}

function buildOperation(
  req: RequestSpec,
  normalizedPath: string,
  securitySchemes: Record<string, unknown>
): Record<string, unknown> {
  const parameters: Array<Record<string, unknown>> = [];
  for (const m of normalizedPath.matchAll(/\{([^}]+)\}/g)) {
    parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
  }
  for (const q of req.query) {
    parameters.push({ name: q.key, in: 'query', required: false, schema: { type: 'string' } });
  }
  for (const [k] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower === 'content-type') continue;
    if (req.auth?.type === 'apikey' && req.auth.key?.toLowerCase() === lower) continue;
    parameters.push({ name: k, in: 'header', required: false, schema: { type: 'string' } });
  }

  let security: Array<Record<string, string[]>> | undefined;
  if (req.auth && req.auth.type !== 'none') {
    if (req.auth.type === 'bearer') {
      securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer' };
      security = [{ bearerAuth: [] }];
    } else if (req.auth.type === 'basic') {
      securitySchemes.basicAuth = { type: 'http', scheme: 'basic' };
      security = [{ basicAuth: [] }];
    } else if (req.auth.type === 'apikey') {
      securitySchemes.apiKeyAuth = {
        type: 'apiKey',
        in: req.auth.in === 'query' ? 'query' : 'header',
        name: req.auth.key || 'X-Api-Key',
      };
      security = [{ apiKeyAuth: [] }];
    }
  }

  let requestBody: Record<string, unknown> | undefined;
  if (req.body && req.body.mode !== 'none') {
    const ct = req.body.contentType || 'application/json';
    if (req.body.mode === 'raw' && req.body.raw) {
      const parsed = parseTemplatedJson(req.body.raw);
      requestBody = {
        required: true,
        content: {
          [ct]: {
            schema: parsed !== undefined ? inferJsonSchema(parsed) : { type: 'string' },
          },
        },
      };
    } else if (req.body.fields && req.body.fields.length > 0) {
      const properties: Record<string, unknown> = {};
      for (const f of req.body.fields) {
        properties[f.key] = f.type === 'file' ? { type: 'string', format: 'binary' } : { type: 'string' };
      }
      requestBody = {
        required: true,
        content: { [ct]: { schema: { type: 'object', properties } } },
      };
    }
  }

  const responses: Record<string, unknown> = {};
  for (const code of inferStatusCodes(req.tests)) {
    responses[code] = { description: `Response ${code}` };
  }

  const op: Record<string, unknown> = {
    summary: req.name,
    operationId: req.id,
  };
  if (req.folder.length > 0) op.tags = [req.folder.join(' / ')];
  if (parameters.length > 0) op.parameters = parameters;
  if (security) op.security = security;
  if (requestBody) op.requestBody = requestBody;
  if (req.tests.length > 0) op['x-reqbridge-assertions'] = req.tests;
  op.responses = responses;
  return op;
}

function mergeRequests(a: RequestSpec, b: RequestSpec): RequestSpec {
  const query = [...a.query];
  for (const q of b.query) {
    if (!query.some((x) => x.key === q.key)) query.push(q);
  }
  const tests = [...a.tests];
  for (const t of b.tests) {
    if (!tests.includes(t)) tests.push(t);
  }
  return {
    ...a,
    headers: { ...b.headers, ...a.headers },
    query,
    body: a.body || b.body,
    auth: a.auth || b.auth,
    tests,
  };
}

export function toOpenApiYaml(col: CollectionSpec): string {
  const baseServer =
    col.baseUrl ||
    Object.entries(col.variables).find(([k]) => /base/i.test(k))?.[1] ||
    'https://api.example.com';

  const groupedPaths = new Map<string, Map<string, RequestSpec>>();
  for (const req of col.requests) {
    const normPath = normalizeOpenApiPath(req.url);
    const method = req.method.toLowerCase();
    let methodsMap = groupedPaths.get(normPath);
    if (!methodsMap) {
      methodsMap = new Map<string, RequestSpec>();
      groupedPaths.set(normPath, methodsMap);
    }
    const existing = methodsMap.get(method);
    methodsMap.set(method, existing ? mergeRequests(existing, req) : req);
  }

  const securitySchemes: Record<string, unknown> = {};
  const pathsObj: Record<string, Record<string, unknown>> = {};
  for (const [normPath, methodsMap] of groupedPaths.entries()) {
    pathsObj[normPath] = {};
    for (const [method, req] of methodsMap.entries()) {
      pathsObj[normPath][method] = buildOperation(req, normPath, securitySchemes);
    }
  }

  const doc: Record<string, unknown> = {
    openapi: '3.1.0',
    info: { title: col.name || 'ReqBridge Exported API', version: '1.0.0' },
    servers: [{ url: baseServer }],
    paths: pathsObj,
  };
  if (Object.keys(securitySchemes).length > 0) {
    doc.components = { securitySchemes };
  }
  return toYamlLines(doc).join('\n') + '\n';
}
