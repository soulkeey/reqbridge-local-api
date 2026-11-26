import { makeRequestId, splitUrlAndQuery } from './parsers-thunder-http';
import { AuthSpec, BodySpec, CollectionSpec, ParseError, RequestSpec } from './types';

interface BruBlock {
  name: string;
  body: string;
  startLine: number;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

function scanBruBlocks(rawText: string): BruBlock[] {
  const blocks: BruBlock[] = [];
  const text = rawText.replace(/\r\n/g, '\n');
  let i = 0;
  let line = 1;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') { line++; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }

    const headerStart = i;
    const startLine = line;
    while (i < text.length && text[i] !== '{' && text[i] !== '\n') i++;
    if (i >= text.length || text[i] !== '{') {
      throw new ParseError(`Invalid .bru syntax near line ${startLine}: expected '{'.`, 'INVALID_BRU_SYNTAX', {
        format: 'bruno',
        line: startLine,
      });
    }
    const name = text.slice(headerStart, i).trim();
    if (!name) {
      throw new ParseError(`Missing block name at line ${startLine}.`, 'INVALID_BRU_SYNTAX', {
        format: 'bruno',
        line: startLine,
      });
    }

    i++;
    const bodyStart = i;
    const lowerName = name.toLowerCase();
    const isJson = lowerName === 'body:json';
    const isJs = lowerName === 'tests' || lowerName.startsWith('script:');
    let depth = 1;
    let quote: string | null = null;
    let escaped = false;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (isJson || isJs) {
        if (quote) {
          if (c === '\n') { line++; if (quote !== '`') quote = null; escaped = false; }
          else if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === quote) quote = null;
        } else {
          if (isJs && c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            continue;
          }
          if (isJs && c === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
              if (text[i] === '\n') line++;
              i++;
            }
            if (i < text.length) i += 2;
            continue;
          }
          if (c === '\n') line++;
          else if ((isJson && c === '"') || (isJs && (c === '"' || c === "'" || c === '`'))) quote = c;
          else if (c === '{') depth++;
          else if (c === '}') depth--;
        }
      } else {
        if (c === '\n') line++;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      i++;
    }
    if (depth !== 0) {
      throw new ParseError(`Unclosed '{' in block '${name}' at line ${startLine}.`, 'INVALID_BRU_SYNTAX', {
        format: 'bruno',
        line: startLine,
      });
    }
    blocks.push({ name, body: text.slice(bodyStart, i - 1), startLine });
  }
  return blocks;
}

function parseKvBlock(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('~')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (key) result[key] = line.slice(colon + 1).trim();
  }
  return result;
}

function unindentBlock(body: string): string {
  const lines = body.replace(/^\n+|\n+$/g, '').split('\n');
  const indents = lines.filter((l) => l.trim().length > 0).map((l) => (l.match(/^\s*/) || [''])[0].length);
  const minIndent = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(minIndent)).join('\n');
}

function extractBruAuth(blocks: BruBlock[]): { auth?: AuthSpec; authMode?: string } {
  const methodBlock = blocks.find((b) => HTTP_METHODS.has(b.name.toLowerCase()));
  const authBlock = blocks.find((b) => b.name.toLowerCase() === 'auth');
  const authMode = (
    (methodBlock ? parseKvBlock(methodBlock.body).auth : undefined) ??
    (authBlock ? parseKvBlock(authBlock.body).mode : undefined)
  )?.toLowerCase();
  if (authMode === 'none') return { auth: { type: 'none' }, authMode };
  if (authMode === 'inherit') return { auth: undefined, authMode };
  const orderedBlocks =
    authMode === 'bearer' || authMode === 'basic' || authMode === 'apikey'
      ? [
          ...blocks.filter((b) => b.name.toLowerCase() === `auth:${authMode}`),
          ...blocks.filter((b) => b.name.toLowerCase() !== `auth:${authMode}`),
        ]
      : blocks;
  for (const b of orderedBlocks) {
    const lower = b.name.toLowerCase();
    const kv = parseKvBlock(b.body);
    if (lower === 'auth:none') return { auth: { type: 'none' }, authMode: authMode ?? 'none' };
    if (lower === 'auth:bearer') return { auth: { type: 'bearer', token: kv.token ?? '{{token}}' }, authMode };
    if (lower === 'auth:basic') return { auth: { type: 'basic', username: kv.username ?? '', password: kv.password ?? '' }, authMode };
    if (lower === 'auth:apikey') {
      return {
        auth: {
          type: 'apikey',
          key: kv.key ?? 'X-Api-Key',
          value: kv.value ?? '{{apiKey}}',
          in: kv.placement === 'query' ? 'query' : 'header',
        },
        authMode,
      };
    }
  }
  return { authMode };
}

export function parseSingleBru(
  rawText: string,
  opts?: { index?: number; folder?: string[]; inheritedAuth?: AuthSpec; inheritedHeaders?: Record<string, string> }
): { request: RequestSpec; seq: number } {
  const blocks = scanBruBlocks(rawText);
  const meta = (() => {
    const m = blocks.find((b) => b.name === 'meta');
    return m ? parseKvBlock(m.body) : {};
  })();
  const methodBlock = blocks.find((b) => HTTP_METHODS.has(b.name.toLowerCase()));
  if (!methodBlock) {
    throw new ParseError('Bruno .bru file is missing an HTTP method block.', 'INVALID_BRU_SYNTAX', { format: 'bruno' });
  }
  const methodKv = parseKvBlock(methodBlock.body);
  if (!methodKv.url) {
    throw new ParseError(`Bruno '${methodBlock.name}' block is missing a url field.`, 'INVALID_BRU_SYNTAX', {
      format: 'bruno',
      line: methodBlock.startLine,
    });
  }

  const { baseUrl, query } = splitUrlAndQuery(methodKv.url);
  const headers: Record<string, string> = { ...(opts?.inheritedHeaders || {}) };
  let body: BodySpec | undefined;
  const tests: string[] = [];

  for (const b of blocks) {
    const lower = b.name.toLowerCase();
    if (lower === 'headers') Object.assign(headers, parseKvBlock(b.body));
    else if (lower === 'query' || lower === 'params:query') {
      for (const [key, value] of Object.entries(parseKvBlock(b.body))) query.push({ key, value });
    } else if (lower === 'body:json' || lower === 'body:text' || lower === 'body:xml') {
      const contentType = lower === 'body:json' ? 'application/json' : lower === 'body:xml' ? 'application/xml' : 'text/plain';
      body = { mode: 'raw', raw: unindentBlock(b.body), contentType };
    } else if (lower === 'body:form-urlencoded') {
      const fields = Object.entries(parseKvBlock(b.body)).map(([key, value]) => ({ key, value }));
      body = { mode: 'urlencoded', contentType: 'application/x-www-form-urlencoded', fields, raw: fields.map((f) => `${f.key}=${f.value}`).join('&') };
    } else if (lower === 'body:multipart-form') {
      const fields = Object.entries(parseKvBlock(b.body)).map(([key, value]) => ({
        key,
        value,
        type: (value.startsWith('@file(') ? 'file' : 'text') as 'text' | 'file',
      }));
      body = { mode: 'formdata', contentType: 'multipart/form-data', fields };
    } else if (lower === 'assert') {
      for (const [k, v] of Object.entries(parseKvBlock(b.body))) tests.push(`${k}: ${v}`);
    } else if (lower === 'tests') {
      for (const line of unindentBlock(b.body).split('\n')) if (line.trim()) tests.push(line.trim());
    }
  }

  const { auth: explicitAuth, authMode } = extractBruAuth(blocks);
  let auth = explicitAuth;
  let inheritedAuth = false;
  if (!auth && opts?.inheritedAuth && (authMode === 'inherit' || !authMode)) {
    auth = opts.inheritedAuth;
    inheritedAuth = opts.inheritedAuth.type !== 'none';
  }

  const name = meta.name || `${methodBlock.name.toUpperCase()} ${baseUrl}`;
  const seq = Number.parseInt(meta.seq || '999999', 10);
  return {
    seq: Number.isNaN(seq) ? 999999 : seq,
    request: {
      id: makeRequestId(name, opts?.index ?? 0),
      name,
      folder: opts?.folder || [],
      method: methodBlock.name.toUpperCase(),
      url: baseUrl,
      headers,
      query,
      body,
      auth,
      tests,
      sourceFormat: 'bruno',
      inheritedAuth,
    },
  };
}

function assertSafeBrunoPath(rawPath: string): string {
  const parts = rawPath.split(/[\\/]+/);
  if (!rawPath.trim() || rawPath.includes('\0') || /^[a-zA-Z]:/.test(rawPath) || /^[\\/]/.test(rawPath) || parts.includes('..')) {
    throw new ParseError(`Unsafe or invalid path in Bruno directory entry: ${rawPath}`, 'INVALID_BRU_SYNTAX', { format: 'bruno' });
  }
  return parts.filter((s) => s && s !== '.').join('/');
}

export function parseBrunoDirectory(files: Array<{ path: string; content: string }>): CollectionSpec {
  const normalized = files.map((f) => ({ path: assertSafeBrunoPath(f.path), content: f.content }));
  let collectionName = 'Bruno Collection';
  const brunoJson = normalized.find((f) => /(^|\/)bruno\.json$/i.test(f.path));
  if (brunoJson) {
    try {
      const parsed = JSON.parse(brunoJson.content) as Record<string, unknown>;
      if (typeof parsed.name === 'string' && parsed.name.trim()) collectionName = parsed.name.trim();
    } catch { /* ignore malformed bruno.json */ }
  }

  const variables: Record<string, string> = {};
  for (const envFile of normalized.filter((f) => /(^|\/)environments\/[^/]+\.bru$/i.test(f.path))) {
    const varsBlock = scanBruBlocks(envFile.content).find((b) => b.name === 'vars');
    if (varsBlock) Object.assign(variables, parseKvBlock(varsBlock.body));
  }

  const dirMeta = new Map<string, { auth?: AuthSpec; headers: Record<string, string> }>();
  for (const metaFile of normalized.filter((f) => /(^|\/)(collection|folder)\.bru$/i.test(f.path))) {
    const dir = metaFile.path.includes('/') ? metaFile.path.slice(0, metaFile.path.lastIndexOf('/')) : '';
    const blocks = scanBruBlocks(metaFile.content);
    const headersBlock = blocks.find((b) => b.name === 'headers');
    dirMeta.set(dir, { auth: extractBruAuth(blocks).auth, headers: headersBlock ? parseKvBlock(headersBlock.body) : {} });
  }

  const requestFiles = normalized.filter(
    (f) => f.path.toLowerCase().endsWith('.bru') && !/(^|\/)(collection|folder)\.bru$/i.test(f.path) && !/(^|\/)environments\//i.test(f.path)
  );
  const parsedItems: Array<{ seq: number; path: string; request: RequestSpec }> = [];
  for (const rf of requestFiles) {
    const dirs = rf.path.split('/').slice(0, -1);
    let inheritedAuth: AuthSpec | undefined;
    const inheritedHeaders: Record<string, string> = {};
    const applyMeta = (dirKey: string): void => {
      const m = dirMeta.get(dirKey);
      if (m) {
        if (m.auth) inheritedAuth = m.auth;
        Object.assign(inheritedHeaders, m.headers);
      }
    };
    applyMeta('');
    for (let i = 0; i < dirs.length; i++) applyMeta(dirs.slice(0, i + 1).join('/'));
    const { seq, request } = parseSingleBru(rf.content, { index: parsedItems.length, folder: dirs, inheritedAuth, inheritedHeaders });
    parsedItems.push({ seq, path: rf.path, request });
  }

  parsedItems.sort((a, b) => (a.seq !== b.seq ? a.seq - b.seq : a.path.localeCompare(b.path)));
  return {
    name: collectionName,
    variables,
    requests: parsedItems.map((item, idx) => ({ ...item.request, id: makeRequestId(item.request.name, idx) })),
    warnings: [],
  };
}
