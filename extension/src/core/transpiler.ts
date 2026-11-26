import { toOpenApiYaml } from './transpiler-openapi';
import { AuthSpec, CollectionSpec, RequestSpec } from './types';

export { toOpenApiYaml };

const BUILTIN_VARS = new Set([
  '$guid',
  '$randomInt',
  '$timestamp',
  '$datetime',
  '$localDatetime',
]);

function collectVarsFromText(text: string, out: Set<string>): void {
  for (const m of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const token = m[1].trim();
    if (token.startsWith('$dotenv ')) {
      const envName = token.slice('$dotenv '.length).trim();
      if (envName) out.add(envName);
    } else if (!BUILTIN_VARS.has(token) && !token.startsWith('$')) {
      out.add(token);
    }
  }
}

function resolveAuthForHttp(req: RequestSpec): {
  header?: { key: string; value: string };
  queryParam?: { key: string; value: string };
} {
  const auth: AuthSpec | undefined = req.auth;
  if (!auth || auth.type === 'none') return {};
  if (auth.type === 'bearer') {
    return { header: { key: 'Authorization', value: `Bearer ${auth.token || '{{token}}'}` } };
  }
  if (auth.type === 'basic') {
    const user = auth.username || '';
    const pass = auth.password || '';
    if (user && !user.includes('{{') && !pass.includes('{{')) {
      const encoded = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
      return { header: { key: 'Authorization', value: `Basic ${encoded}` } };
    }
    return { header: { key: 'Authorization', value: 'Basic {{basicCredentials}}' } };
  }
  if (auth.type === 'apikey') {
    const k = auth.key || 'X-Api-Key';
    const v = auth.value || '{{apiKey}}';
    if (auth.in === 'query') return { queryParam: { key: k, value: v } };
    return { header: { key: k, value: v } };
  }
  return {};
}

function buildFullUrl(req: RequestSpec, extraQuery?: { key: string; value: string }): string {
  const allQuery = [...req.query];
  if (extraQuery) allQuery.push(extraQuery);
  if (allQuery.length === 0) return req.url;
  const sep = req.url.includes('?') ? '&' : '?';
  const qs = allQuery.map((q) => `${q.key}=${q.value}`).join('&');
  return `${req.url}${sep}${qs}`;
}

export function toHttpFile(col: CollectionSpec): {
  httpContent: string;
  envExample: string;
} {
  const lines: string[] = [
    '# Generated locally by ReqBridge Local API (0 network uploads)',
    `# Collection: ${col.name || 'Exported Collection'}`,
    '',
  ];

  const referencedVars = new Set<string>();
  for (const [k, v] of Object.entries(col.variables)) {
    const isSecret = /token|secret|key|pass|auth|credential/i.test(k);
    lines.push(isSecret ? `# @${k} configured via .env` : `@${k} = ${v}`);
    referencedVars.add(k);
  }
  if (Object.keys(col.variables).length > 0) lines.push('');

  for (const req of col.requests) {
    const folderPrefix = req.folder.length > 0 ? `${req.folder.join(' / ')} / ` : '';
    lines.push(`### ${folderPrefix}${req.name}`);
    lines.push(`# @name ${req.id}`);
    if (req.inheritedAuth) {
      lines.push('# [Inherited parent folder auth preserved]');
    }

    const resolvedAuth = resolveAuthForHttp(req);
    const fullUrl = buildFullUrl(req, resolvedAuth.queryParam);
    lines.push(`${req.method} ${fullUrl}`);
    collectVarsFromText(fullUrl, referencedVars);

    const emittedHeaders = new Map<string, { name: string; value: string }>();
    if (resolvedAuth.header) {
      emittedHeaders.set(resolvedAuth.header.key.toLowerCase(), {
        name: resolvedAuth.header.key,
        value: resolvedAuth.header.value,
      });
    }
    for (const [k, v] of Object.entries(req.headers)) {
      emittedHeaders.set(k.toLowerCase(), { name: k, value: v });
    }
    if (req.body && req.body.mode !== 'none' && req.body.contentType && !emittedHeaders.has('content-type')) {
      emittedHeaders.set('content-type', { name: 'Content-Type', value: req.body.contentType });
    }

    for (const { name, value } of emittedHeaders.values()) {
      lines.push(`${name}: ${value}`);
      collectVarsFromText(value, referencedVars);
    }

    if (req.body && req.body.mode !== 'none') {
      if (req.body.raw) {
        lines.push('');
        lines.push(req.body.raw);
        collectVarsFromText(req.body.raw, referencedVars);
      } else if (req.body.fields && req.body.fields.length > 0) {
        lines.push('');
        for (const f of req.body.fields) {
          lines.push(`# ${f.key}=${f.value}`);
          collectVarsFromText(f.value, referencedVars);
        }
      }
    }

    if (req.tests.length > 0) {
      lines.push('');
      for (const t of req.tests) {
        lines.push(`# @assert ${t}`);
      }
    }
    lines.push('');
  }

  const envLines: string[] = ['# ReqBridge .env.example (fill in local secrets — never commit real .env)'];
  for (const key of [...referencedVars].sort()) {
    const isSecret = /token|secret|key|pass|auth|credential/i.test(key);
    const defaultVal = !isSecret && col.variables[key] ? col.variables[key] : '';
    envLines.push(`${key}=${defaultVal}`);
  }

  return {
    httpContent: lines.join('\n'),
    envExample: envLines.join('\n') + '\n',
  };
}

function quoteShellSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurlCommand(req: RequestSpec): string {
  const resolvedAuth = resolveAuthForHttp(req);
  const fullUrl = buildFullUrl(req, resolvedAuth.queryParam);
  const parts: string[] = ['curl', '-X', req.method.toUpperCase(), quoteShellSingle(fullUrl)];

  const headers = new Map<string, { name: string; value: string }>();
  if (resolvedAuth.header) {
    headers.set(resolvedAuth.header.key.toLowerCase(), {
      name: resolvedAuth.header.key,
      value: resolvedAuth.header.value,
    });
  }
  for (const [k, v] of Object.entries(req.headers)) {
    headers.set(k.toLowerCase(), { name: k, value: v });
  }
  if (req.body && req.body.mode !== 'none' && req.body.contentType && !headers.has('content-type')) {
    headers.set('content-type', { name: 'Content-Type', value: req.body.contentType });
  }
  for (const { name, value } of headers.values()) {
    parts.push('-H', quoteShellSingle(`${name}: ${value}`));
  }

  if (req.body && req.body.mode !== 'none') {
    if (req.body.mode === 'formdata' && req.body.fields) {
      for (const f of req.body.fields) {
        const val = f.type === 'file' ? `@${f.value}` : f.value;
        parts.push('-F', quoteShellSingle(`${f.key}=${val}`));
      }
    } else if (req.body.raw !== undefined && req.body.raw !== '') {
      parts.push('--data-raw', quoteShellSingle(req.body.raw));
    } else if (req.body.fields && req.body.fields.length > 0) {
      const encoded = req.body.fields.map((f) => `${f.key}=${f.value}`).join('&');
      parts.push('--data-raw', quoteShellSingle(encoded));
    }
  }
  return parts.join(' ');
}
