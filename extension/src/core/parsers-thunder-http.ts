import { AuthSpec, BodySpec, CollectionSpec, ParseError, QueryParam, RequestSpec } from './types';

function safeDecode(val: string): string {
  if (val.includes('{{')) return val;
  try {
    return decodeURIComponent(val.replace(/\+/g, ' '));
  } catch {
    return val;
  }
}

export function splitUrlAndQuery(rawUrl: string): { baseUrl: string; query: QueryParam[] } {
  const qIdx = rawUrl.indexOf('?');
  if (qIdx === -1) return { baseUrl: rawUrl, query: [] };
  const baseUrl = rawUrl.slice(0, qIdx);
  const query: QueryParam[] = [];
  for (const part of rawUrl.slice(qIdx + 1).split('&')) {
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) query.push({ key: safeDecode(part), value: '' });
    else query.push({ key: safeDecode(part.slice(0, eqIdx)), value: safeDecode(part.slice(eqIdx + 1)) });
  }
  return { baseUrl, query };
}

export function makeRequestId(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug ? `${slug}_${index + 1}` : `req_${index + 1}`;
}

function buildFolderPath(
  containerId: string | undefined,
  folderMap: Map<string, { name: string; containerId?: string }>
): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let cur = containerId;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const folder = folderMap.get(cur);
    if (!folder) break;
    path.unshift(folder.name);
    cur = folder.containerId;
  }
  return path;
}

function parseThunderAuth(raw: Record<string, unknown> | undefined): AuthSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = String(raw.type || '').toLowerCase();
  if (type === 'none') return { type: 'none' };
  if (type === 'bearer') return { type: 'bearer', token: String(raw.bearer ?? '{{token}}') };
  if (type === 'basic') {
    return { type: 'basic', username: String(raw.username ?? ''), password: String(raw.password ?? '') };
  }
  if (type === 'api-key' || type === 'apikey') {
    return {
      type: 'apikey',
      key: String(raw.apiKeyPrefix || raw.key || 'X-Api-Key'),
      value: String(raw.apiKeyValue || raw.value || '{{apiKey}}'),
      in: raw.apiKeyIn === 'query' ? 'query' : 'header',
    };
  }
  return undefined;
}

function parseThunderBody(raw: Record<string, unknown> | undefined): BodySpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = String(raw.type || '').toLowerCase();
  if (type === 'json' || type === 'text' || type === 'xml') {
    const contentType = type === 'json' ? 'application/json' : type === 'xml' ? 'application/xml' : 'text/plain';
    return { mode: 'raw', raw: typeof raw.raw === 'string' ? raw.raw : JSON.stringify(raw.raw ?? ''), contentType };
  }
  if ((type === 'formencoded' || type === 'form') && Array.isArray(raw.form)) {
    const fields = raw.form
      .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object' && f.name))
      .map((f) => ({ key: String(f.name), value: String(f.value ?? '') }));
    return { mode: 'urlencoded', contentType: 'application/x-www-form-urlencoded', fields, raw: fields.map((f) => `${f.key}=${f.value}`).join('&') };
  }
  if (type === 'formdata' && Array.isArray(raw.form)) {
    const fields = raw.form
      .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object' && f.name))
      .map((f) => ({ key: String(f.name), value: String(f.value ?? ''), type: (f.isFile ? 'file' : 'text') as 'text' | 'file' }));
    return { mode: 'formdata', contentType: 'multipart/form-data', fields };
  }
  return undefined;
}

export function parseThunderCollection(obj: Record<string, unknown>): CollectionSpec {
  if (!Array.isArray(obj.requests)) {
    throw new ParseError('Thunder Client JSON must include a requests array.', 'INVALID_THUNDER_SCHEMA', { format: 'thunder' });
  }
  const folderMap = new Map<string, { name: string; containerId?: string }>();
  if (Array.isArray(obj.folders)) {
    for (const f of obj.folders) {
      if (f && typeof f === 'object' && typeof f._id === 'string') {
        folderMap.set(f._id, {
          name: String(f.name || 'Folder'),
          containerId: typeof f.containerId === 'string' ? f.containerId : undefined,
        });
      }
    }
  }

  const requests: RequestSpec[] = [];
  obj.requests.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const method = String(rec.method || 'GET').toUpperCase();
    const { baseUrl, query } = splitUrlAndQuery(String(rec.url || ''));

    if (Array.isArray(rec.params)) {
      for (const p of rec.params) {
        if (p && typeof p === 'object' && !p.isDisabled && p.name && !p.isPath) {
          const key = String(p.name);
          const value = String(p.value ?? '');
          if (!query.some((q) => q.key === key && q.value === value)) {
            query.push({ key, value });
          }
        }
      }
    }
    const headers: Record<string, string> = {};
    if (Array.isArray(rec.headers)) {
      for (const h of rec.headers) {
        if (h && typeof h === 'object' && !h.isDisabled && h.name) headers[String(h.name)] = String(h.value ?? '');
      }
    }
    const tests: string[] = [];
    if (Array.isArray(rec.tests)) {
      for (const t of rec.tests) {
        if (!t || typeof t !== 'object') continue;
        if (t.type === 'res-code' && t.value !== undefined) tests.push(`status == ${String(t.value)}`);
        else if (t.type === 'json-query' && t.custom && t.value !== undefined) tests.push(`${String(t.custom)} == ${String(t.value)}`);
        else if (t.type && t.value !== undefined) tests.push(`${String(t.type)}: ${String(t.value)}`);
      }
    }
    const name = String(rec.name || `${method} ${baseUrl}`);
    requests.push({
      id: makeRequestId(name, idx),
      name,
      folder: buildFolderPath(typeof rec.containerId === 'string' ? rec.containerId : undefined, folderMap),
      method,
      url: baseUrl || '/',
      headers,
      query,
      body: parseThunderBody(rec.body as Record<string, unknown> | undefined),
      auth: parseThunderAuth(rec.auth as Record<string, unknown> | undefined),
      tests,
      sourceFormat: 'thunder',
    });
  });

  return { name: String(obj.collectionName || obj.name || 'Thunder Client Collection'), variables: {}, requests, warnings: [] };
}

export function parseHttpFile(rawText: string): CollectionSpec {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const variables: Record<string, string> = {};
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  const varRe = /^\s*@([A-Za-z0-9_.-]+)\s*=\s*(.*)$/;

  for (const line of lines) {
    if (/^\s*###/.test(line)) {
      if (currentBlock.some((l) => l.trim() !== '')) blocks.push(currentBlock);
      currentBlock = [line];
      continue;
    }
    currentBlock.push(line);
  }
  if (currentBlock.some((l) => l.trim() !== '')) blocks.push(currentBlock);

  const requests: RequestSpec[] = [];
  for (const block of blocks) {
    let title = '', customName = '', reqLineIdx = -1;
    const tests: string[] = [];
    for (let i = 0; i < block.length; i++) {
      const trimmed = block[i].trim();
      const varMatch = block[i].match(varRe);
      if (varMatch) { variables[varMatch[1]] = varMatch[2].trim(); continue; }
      if (trimmed.startsWith('###')) title = trimmed.replace(/^###\s*/, '').trim();
      else if (/^#\s*@name\s+/i.test(trimmed)) customName = trimmed.replace(/^#\s*@name\s+/i, '').trim();
      else if (/^#\s*@assert\s+/i.test(trimmed)) tests.push(trimmed.replace(/^#\s*@assert\s+/i, '').trim());
      else if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i.test(trimmed)) { reqLineIdx = i; break; }
    }
    if (reqLineIdx === -1) continue;

    const reqParts = block[reqLineIdx].trim().split(/\s+/);
    const method = reqParts[0].toUpperCase();
    let fullUrl = reqParts[1];
    let idx = reqLineIdx + 1;
    while (idx < block.length && /^\s*[?&]\S+/.test(block[idx])) { fullUrl += block[idx].trim(); idx++; }

    const headers: Record<string, string> = {};
    while (idx < block.length && block[idx].trim() !== '') {
      const line = block[idx];
      const varMatch = line.match(varRe);
      if (varMatch) { variables[varMatch[1]] = varMatch[2].trim(); idx++; continue; }
      if (/^\s*[#\/]/.test(line)) {
        if (/^#\s*@assert\s+/i.test(line.trim())) tests.push(line.trim().replace(/^#\s*@assert\s+/i, '').trim());
        idx++; continue;
      }
      const colon = line.indexOf(':');
      if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      idx++;
    }

    const bodyLines: string[] = [];
    for (let j = idx + 1; j < block.length; j++) {
      const trimmed = block[j].trim();
      if (/^#\s*@assert\s+/i.test(trimmed)) tests.push(trimmed.replace(/^#\s*@assert\s+/i, '').trim());
      else bodyLines.push(block[j]);
    }
    let cut = bodyLines.length;
    for (let k = bodyLines.length - 1; k >= 0; k--) {
      const trimmed = bodyLines[k].trim();
      const varMatch = bodyLines[k].match(varRe);
      if (varMatch) { variables[varMatch[1]] = varMatch[2].trim(); cut = k; }
      else if (trimmed === '' || /^[#/]/.test(trimmed)) continue;
      else break;
    }
    bodyLines.length = cut;
    const rawBody = bodyLines.join('\n').trim();
    const { baseUrl, query } = splitUrlAndQuery(fullUrl);
    const name = title || customName || `${method} ${baseUrl}`;
    const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
    requests.push({
      id: makeRequestId(customName || name, requests.length),
      name,
      folder: [],
      method,
      url: baseUrl,
      headers,
      query,
      body: rawBody ? { mode: 'raw', raw: rawBody, contentType: ctKey ? headers[ctKey] : undefined } : undefined,
      tests,
      sourceFormat: 'http',
    });
  }

  if (requests.length === 0) {
    throw new ParseError('No valid HTTP request lines found in .http file.', 'INVALID_HTTP_SYNTAX', { format: 'http' });
  }
  return { name: 'HTTP File Collection', variables, requests, warnings: [] };
}
