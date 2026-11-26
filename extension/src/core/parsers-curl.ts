import { makeRequestId, splitUrlAndQuery } from './parsers-thunder-http';
import { AuthSpec, BodySpec, CollectionSpec, ParseError, RequestSpec } from './types';

function tokenizeCurl(raw: string): string[] {
  const joined = raw.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let hasToken = false;
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];
    if (quote) {
      if (quote === "'" && ch === "'") quote = null;
      else if (quote === '"' && ch === '\\' && i + 1 < joined.length) { cur += joined[++i]; }
      else if (quote === '"' && ch === '"') quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '$' && joined[i + 1] === "'") { quote = "'"; hasToken = true; i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; hasToken = true; continue; }
    if (/\s/.test(ch)) {
      if (hasToken) { tokens.push(cur); cur = ''; hasToken = false; }
      continue;
    }
    if (ch === '\\' && i + 1 < joined.length) { cur += joined[++i]; hasToken = true; continue; }
    cur += ch;
    hasToken = true;
  }
  if (hasToken) tokens.push(cur);
  return tokens;
}

export function parseCurlCommand(rawText: string): CollectionSpec {
  const tokens = tokenizeCurl(rawText);
  if (tokens.length === 0 || !/^curl(?:\.exe)?$/i.test(tokens[0])) {
    throw new ParseError('Input is not a valid cURL command.', 'INVALID_CURL_SYNTAX', { format: 'curl' });
  }
  let method = '';
  let rawUrl = '';
  let forceGet = false;
  const headers: Record<string, string> = {};
  const dataParts: string[] = [];
  const formFields: Array<{ key: string; value: string; type: 'text' | 'file' }> = [];
  let auth: AuthSpec | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => (i + 1 < tokens.length ? tokens[++i] : '');
    if (t === '-X' || t === '--request') method = next().toUpperCase();
    else if (t.startsWith('-X') && t.length > 2) method = t.slice(2).toUpperCase();
    else if (t === '--url') rawUrl = next();
    else if (t === '-I' || t === '--head') method = 'HEAD';
    else if (t === '-G' || t === '--get') forceGet = true;
    else if (t === '-H' || t === '--header') {
      const h = next();
      const c = h.indexOf(':');
      if (c > 0) headers[h.slice(0, c).trim()] = h.slice(c + 1).trim();
    } else if (t === '-A' || t === '--user-agent') headers['User-Agent'] = next();
    else if (t === '-b' || t === '--cookie') headers['Cookie'] = next();
    else if (t === '-u' || t === '--user') {
      const u = next();
      const c = u.indexOf(':');
      auth = { type: 'basic', username: c >= 0 ? u.slice(0, c) : u, password: c >= 0 ? u.slice(c + 1) : '' };
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-urlencode') {
      dataParts.push(next());
    } else if (t === '-F' || t === '--form') {
      const f = next();
      const eq = f.indexOf('=');
      if (eq > 0) {
        const val = f.slice(eq + 1);
        formFields.push({
          key: f.slice(0, eq),
          value: val.startsWith('@') ? val.slice(1) : val,
          type: val.startsWith('@') ? 'file' : 'text',
        });
      }
    } else if (!t.startsWith('-') && !rawUrl) {
      rawUrl = t;
    }
  }

  if (!rawUrl) {
    throw new ParseError('cURL command is missing a target URL.', 'INVALID_CURL_SYNTAX', { format: 'curl' });
  }
  if (!/^https?:\/\//i.test(rawUrl) && !rawUrl.startsWith('{{')) rawUrl = `https://${rawUrl}`;
  const { baseUrl, query } = splitUrlAndQuery(rawUrl);

  const authHdrKey = Object.keys(headers).find((k) => k.toLowerCase() === 'authorization');
  if (authHdrKey && !auth) {
    const val = headers[authHdrKey];
    if (/^Bearer\s+/i.test(val)) {
      auth = { type: 'bearer', token: val.replace(/^Bearer\s+/i, '').trim() };
      delete headers[authHdrKey];
    }
  }

  let body: BodySpec | undefined;
  const joinedData = dataParts.join('&');
  if (forceGet && joinedData) {
    for (const part of joinedData.split('&')) {
      const eq = part.indexOf('=');
      query.push(eq >= 0 ? { key: part.slice(0, eq), value: part.slice(eq + 1) } : { key: part, value: '' });
    }
  } else if (formFields.length > 0) {
    body = { mode: 'formdata', contentType: 'multipart/form-data', fields: formFields };
  } else if (joinedData) {
    const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
    const inferredCt = ctKey
      ? headers[ctKey]
      : /^[\[{]/.test(joinedData.trim())
        ? 'application/json'
        : 'application/x-www-form-urlencoded';
    body = { mode: 'raw', raw: joinedData, contentType: inferredCt };
  }

  const finalMethod = forceGet ? 'GET' : method || (body ? 'POST' : 'GET');
  const name = `${finalMethod} ${baseUrl}`;
  const req: RequestSpec = {
    id: makeRequestId(name, 0),
    name,
    folder: [],
    method: finalMethod,
    url: baseUrl,
    headers,
    query,
    body,
    auth,
    tests: [],
    sourceFormat: 'curl',
  };
  return { name: 'Imported cURL', variables: {}, requests: [req], warnings: [] };
}

export const looksLikeCurl = (text: string): boolean => /^\s*curl(?:\.exe)?(?:\s+|$)/i.test(text);
