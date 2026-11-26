import { makeRequestId } from './parsers-thunder-http';
import { AuthSpec, BodySpec, CollectionSpec, ParseError, QueryParam, RequestSpec } from './types';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
type YamlLine = { indent: number; text: string };

function stripYamlComment(line: string): string {
  let quote: string | null = null, esc = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (esc) esc = false;
      else if (quote === '"' && ch === '\\') esc = true;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

function unquoteScalar(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function parseYamlScalar(raw: string): unknown {
  const s = raw.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === '{}') return {};
  if (s === '[]') return [];
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.parse(s); } catch { /* fall through */ }
    if (s.startsWith('[')) {
      return s.slice(1, -1).split(',').map((x) => parseYamlScalar(x)).filter((x) => x !== null && x !== '');
    }
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return unquoteScalar(s);
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function splitColonOutsideQuotes(text: string): number {
  let quote: string | null = null, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (esc) esc = false;
      else if (quote === '"' && ch === '\\') esc = true;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]))) return i;
  }
  return -1;
}

function parseYamlBlock(lines: YamlLine[], idx: number, minIndent: number): { value: unknown; next: number } {
  if (idx >= lines.length || lines[idx].indent < minIndent) return { value: {}, next: idx };
  if (lines[idx].text === '-' || lines[idx].text.startsWith('- ')) {
    const arr: unknown[] = [];
    const baseIndent = lines[idx].indent;
    while (idx < lines.length && lines[idx].indent === baseIndent && (lines[idx].text === '-' || lines[idx].text.startsWith('- '))) {
      const rest = lines[idx++].text.slice(1).trim();
      if (!rest) {
        const sub = idx < lines.length && lines[idx].indent > baseIndent ? parseYamlBlock(lines, idx, baseIndent + 1) : { value: null, next: idx };
        arr.push(sub.value); idx = sub.next;
      } else {
        const colon = splitColonOutsideQuotes(rest);
        if (colon > 0) {
          const itemObj: Record<string, unknown> = {};
          const k = unquoteScalar(rest.slice(0, colon));
          const vRaw = rest.slice(colon + 1).trim();
          if (vRaw === '' || vRaw === '|' || vRaw === '>') {
            const sub = idx < lines.length && lines[idx].indent > baseIndent ? parseYamlBlock(lines, idx, baseIndent + 1) : { value: {}, next: idx };
            itemObj[k] = sub.value; idx = sub.next;
          } else itemObj[k] = parseYamlScalar(vRaw);
          if (idx < lines.length && lines[idx].indent > baseIndent && !lines[idx].text.startsWith('-')) {
            const extra = parseYamlBlock(lines, idx, baseIndent + 1);
            if (extra.value && typeof extra.value === 'object' && !Array.isArray(extra.value)) Object.assign(itemObj, extra.value as Record<string, unknown>);
            idx = extra.next;
          }
          arr.push(itemObj);
        } else arr.push(parseYamlScalar(rest));
      }
    }
    return { value: arr, next: idx };
  }

  const obj: Record<string, unknown> = {};
  const baseIndent = lines[idx].indent;
  while (idx < lines.length && lines[idx].indent === baseIndent && !lines[idx].text.startsWith('- ')) {
    const colon = splitColonOutsideQuotes(lines[idx].text);
    if (colon <= 0) { idx++; continue; }
    const key = unquoteScalar(lines[idx].text.slice(0, colon));
    const vRaw = lines[idx].text.slice(colon + 1).trim();
    idx++;
    if (vRaw === '|' || vRaw === '>') {
      const blockLines: string[] = [];
      const textIndent = idx < lines.length && lines[idx].indent > baseIndent ? lines[idx].indent : baseIndent + 2;
      while (idx < lines.length && lines[idx].indent >= textIndent) { blockLines.push(lines[idx++].text); }
      obj[key] = blockLines.join('\n');
    } else if (!vRaw) {
      const sub = idx < lines.length && lines[idx].indent > baseIndent ? parseYamlBlock(lines, idx, baseIndent + 1) : { value: {}, next: idx };
      obj[key] = sub.value; idx = sub.next;
    } else obj[key] = parseYamlScalar(vRaw);
  }
  return { value: obj, next: idx };
}

export function parseSimpleYaml(rawText: string): Record<string, unknown> {
  const lines: YamlLine[] = [];
  for (const raw of rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')) {
    const cleaned = stripYamlComment(raw);
    const trimmed = cleaned.trim();
    if (!trimmed || trimmed === '---' || trimmed === '...') continue;
    lines.push({ indent: cleaned.length - cleaned.trimStart().length, text: trimmed });
  }
  if (lines.length === 0) return {};
  const parsed = parseYamlBlock(lines, 0, lines[0].indent).value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError('Expected YAML mapping object for OpenAPI specification.', 'INVALID_OPENAPI_SCHEMA', { format: 'openapi' });
  }
  return parsed as Record<string, unknown>;
}

function resolveRef(doc: Record<string, unknown>, node: unknown, seen = new Set<string>()): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const ref = (node as Record<string, unknown>).$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/') || seen.has(ref)) return node;
  seen.add(ref);
  let cur: unknown = doc;
  for (const seg of ref.slice(2).split('/')) {
    if (!cur || typeof cur !== 'object') return node;
    cur = (cur as Record<string, unknown>)[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return cur ? resolveRef(doc, cur, seen) : node;
}

function sampleFromSchema(doc: Record<string, unknown>, schemaNode: unknown, depth = 0, seen = new Set<string>()): unknown {
  if (depth > 5 || !schemaNode || typeof schemaNode !== 'object') return 'string';
  const raw = schemaNode as Record<string, unknown>;
  if (typeof raw.$ref === 'string') {
    if (seen.has(raw.$ref)) return {};
    seen.add(raw.$ref);
    const res = sampleFromSchema(doc, resolveRef(doc, raw), depth + 1, seen);
    seen.delete(raw.$ref);
    return res;
  }
  if (raw.example !== undefined) return raw.example;
  if (raw.default !== undefined) return raw.default;
  if (Array.isArray(raw.enum) && raw.enum.length > 0) return raw.enum[0];
  if (Array.isArray(raw.oneOf) && raw.oneOf.length > 0) return sampleFromSchema(doc, raw.oneOf[0], depth + 1, seen);
  if (Array.isArray(raw.anyOf) && raw.anyOf.length > 0) return sampleFromSchema(doc, raw.anyOf[0], depth + 1, seen);
  const type = Array.isArray(raw.type) ? raw.type[0] : raw.type;
  if (type === 'object' || raw.properties) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((raw.properties || {}) as Record<string, unknown>)) out[k] = sampleFromSchema(doc, v, depth + 1, seen);
    return out;
  }
  if (type === 'array') return [sampleFromSchema(doc, raw.items, depth + 1, seen)];
  if (type === 'integer') return 1;
  if (type === 'number') return 19.0;
  if (type === 'boolean') return true;
  return raw.format === 'email' ? 'dev@example.com' : 'example';
}

function resolveOpenApiAuth(doc: Record<string, unknown>, secList: unknown): AuthSpec | undefined {
  const schemes = ((doc.components as Record<string, unknown> | undefined)?.securitySchemes || doc.securityDefinitions || {}) as Record<string, unknown>;
  if (!Array.isArray(secList) || secList.length === 0) return undefined;
  for (const entry of secList) {
    if (!entry || typeof entry !== 'object') continue;
    for (const name of Object.keys(entry as Record<string, unknown>)) {
      const s = resolveRef(doc, schemes[name]) as Record<string, unknown> | undefined;
      if (!s) continue;
      const type = String(s.type || '').toLowerCase();
      if (type === 'http') return String(s.scheme || '').toLowerCase() === 'basic' ? { type: 'basic', username: '{{username}}', password: '{{password}}' } : { type: 'bearer', token: '{{apiToken}}' };
      if (type === 'apikey') return { type: 'apikey', key: String(s.name || 'X-Api-Key'), value: '{{apiKey}}', in: s.in === 'query' ? 'query' : 'header' };
      if (type === 'basic') return { type: 'basic', username: '{{username}}', password: '{{password}}' };
      if (type === 'oauth2' || type === 'openidconnect') return { type: 'bearer', token: '{{apiToken}}' };
    }
  }
  return undefined;
}

export function parseOpenApiSpec(input: string | Record<string, unknown>): CollectionSpec {
  const doc = typeof input === 'string'
    ? (/^[{\[]/.test(input.trim()) ? (JSON.parse(input) as Record<string, unknown>) : parseSimpleYaml(input))
    : input;
  if (!doc || typeof doc !== 'object' || (!doc.openapi && !doc.swagger) || !doc.paths || typeof doc.paths !== 'object') {
    throw new ParseError('OpenAPI document must include openapi (3.x) or swagger (2.0) and a paths object.', 'INVALID_OPENAPI_SCHEMA', { format: 'openapi' });
  }
  const servers = Array.isArray(doc.servers) ? (doc.servers as Array<Record<string, unknown>>) : [];
  let baseUrl = typeof servers[0]?.url === 'string' ? servers[0].url.trim() : '';
  if (!baseUrl && typeof doc.host === 'string') {
    const scheme = Array.isArray(doc.schemes) && doc.schemes[0] ? String(doc.schemes[0]) : 'https';
    baseUrl = `${scheme}://${doc.host}${typeof doc.basePath === 'string' ? doc.basePath : ''}`;
  }
  const variables: Record<string, string> = { baseUrl: (baseUrl || 'https://api.example.com').replace(/\/+$/, '') };
  const requests: RequestSpec[] = [];

  for (const [rawPath, pathNode] of Object.entries(doc.paths as Record<string, unknown>)) {
    if (!pathNode || typeof pathNode !== 'object') continue;
    const pathObj = pathNode as Record<string, unknown>;
    const pathParams = Array.isArray(pathObj.parameters) ? pathObj.parameters : [];
    for (const [mKey, opNode] of Object.entries(pathObj)) {
      if (!HTTP_METHODS.has(mKey.toLowerCase()) || !opNode || typeof opNode !== 'object') continue;
      const op = opNode as Record<string, unknown>;
      const query: QueryParam[] = [];
      const headers: Record<string, string> = {};
      for (const pRaw of [...pathParams, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
        const p = resolveRef(doc, pRaw) as Record<string, unknown> | undefined;
        if (!p || typeof p !== 'object' || !p.name) continue;
        const pName = String(p.name);
        const ex = p.example ?? (p.schema && typeof p.schema === 'object' ? (p.schema as Record<string, unknown>).example ?? (p.schema as Record<string, unknown>).default : undefined);
        if (p.in === 'query') query.push({ key: pName, value: ex !== undefined ? String(ex) : `{{${pName}}}` });
        else if (p.in === 'header') headers[pName] = ex !== undefined ? String(ex) : `{{${pName}}}`;
        else if (p.in === 'path' && !(pName in variables)) variables[pName] = ex !== undefined ? String(ex) : `sample_${pName}`;
      }
      let body: BodySpec | undefined;
      const reqBody = resolveRef(doc, op.requestBody) as Record<string, unknown> | undefined;
      const content = reqBody?.content as Record<string, Record<string, unknown>> | undefined;
      if (content && typeof content === 'object') {
        const ct = Object.keys(content).find((k) => k.includes('json')) || Object.keys(content)[0];
        if (ct) {
          const media = content[ct] || {};
          const exMap = media.examples as Record<string, Record<string, unknown>> | undefined;
          const firstEx = exMap ? Object.values(exMap)[0]?.value : undefined;
          const sample = media.example ?? firstEx ?? (media.schema ? sampleFromSchema(doc, media.schema) : {});
          if (ct.includes('x-www-form-urlencoded') && sample && typeof sample === 'object') {
            const fields = Object.entries(sample as Record<string, unknown>).map(([key, v]) => ({ key, value: String(v ?? '') }));
            body = { mode: 'urlencoded', contentType: ct, fields, raw: fields.map((f) => `${f.key}=${f.value}`).join('&') };
          } else {
            body = { mode: 'raw', contentType: ct, raw: typeof sample === 'string' ? sample : JSON.stringify(sample, null, 2) };
          }
        }
      }
      const normPath = rawPath.replace(/\{([^}]+)\}/g, '{{$1}}');
      const fullUrl = normPath.startsWith('http') ? normPath : `{{baseUrl}}${normPath.startsWith('/') ? normPath : `/${normPath}`}`;
      const tags = Array.isArray(op.tags) ? op.tags.map((t) => String(t)) : [];
      const name = String(op.summary || op.operationId || `${mKey.toUpperCase()} ${rawPath}`);
      const okCode = Object.keys((op.responses as Record<string, unknown>) || {}).find((c) => /^2\d\d$/.test(c));
      requests.push({
        id: makeRequestId(String(op.operationId || name), requests.length),
        name,
        folder: tags.slice(0, 1),
        method: mKey.toUpperCase(),
        url: fullUrl,
        headers,
        query,
        body,
        auth: resolveOpenApiAuth(doc, op.security ?? doc.security),
        tests: okCode ? [`status == ${okCode}`] : [],
        sourceFormat: 'openapi',
      });
    }
  }
  if (requests.length === 0) throw new ParseError('No HTTP operations found inside OpenAPI paths.', 'INVALID_OPENAPI_SCHEMA', { format: 'openapi' });
  const info = doc.info as Record<string, unknown> | undefined;
  return { name: String(info?.title || 'OpenAPI Collection'), baseUrl: variables.baseUrl, variables, requests, warnings: [] };
}

export const looksLikeOpenApiYaml = (text: string): boolean => /^(?:openapi|swagger)\s*:/m.test(text) && /^paths\s*:/m.test(text);
