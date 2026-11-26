function assertSafeCiFileName(fileName: string, label: string): string {
  if (typeof fileName !== 'string') {
    throw new Error(`Invalid ${label} filename: expected string`);
  }
  const trimmed = fileName.trim();
  if (
    !trimmed ||
    /[\u0000-\u001F\u007F\u0085\u2028\u2029]/.test(fileName) ||
    /^[\\/]/.test(trimmed) ||
    /^~(?:[\\/]|$)/.test(trimmed) ||
    /^[a-zA-Z]:/.test(trimmed) ||
    trimmed.split(/[\\/]+/).includes('..') ||
    /[;`$|<>&"']/.test(trimmed)
  ) {
    throw new Error(`Unsafe or invalid ${label} filename: ${JSON.stringify(fileName)}`);
  }
  return trimmed;
}

export function exportCiBundle(
  httpFileName: string,
  csvFileName?: string
): { runnerJs: string; workflowYml: string } {
  const safeHttp = assertSafeCiFileName(httpFileName, 'HTTP');
  const safeCsv = csvFileName !== undefined ? assertSafeCiFileName(csvFileName, 'CSV') : undefined;
  const defaultHttp = JSON.stringify(safeHttp);
  const defaultCsv = safeCsv ? JSON.stringify(safeCsv) : 'null';

  const runnerJs = `import fs from 'node:fs/promises';

const HTTP_FILE = process.env.REQBRIDGE_HTTP_FILE || ${defaultHttp};
const CSV_FILE = process.env.REQBRIDGE_CSV_FILE || ${defaultCsv};
const JUNIT_OUT = process.env.REQBRIDGE_JUNIT_OUT || 'reqbridge-results.xml';
const TIMEOUT_MS = Number(process.env.REQBRIDGE_TIMEOUT_MS || 15000);

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseCsv(text) {
  const clean = text.replace(/^\\uFEFF/, '');
  if (!clean.trim()) return [];
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\\r' || ch === '\\n') {
      if (ch === '\\r' && clean[i + 1] === '\\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length <= 1) return [];
  const hdrs = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => !(r.length === 1 && r[0] === '')).map((r) => {
    const obj = {};
    hdrs.forEach((h, idx) => {
      if (h) Object.defineProperty(obj, h, { value: r[idx] ?? '', enumerable: true, writable: true, configurable: true });
    });
    return obj;
  });
}

function parseHttp(text) {
  const vars = {};
  const blocks = [];
  let cur = [];
  const varRe = /^\\s*@([A-Za-z0-9_.-]+)\\s*=\\s*(.*)$/;
  for (const line of text.replace(/\\r\\n/g, '\\n').split('\\n')) {
    if (/^\\s*###/.test(line)) { if (cur.some((l) => l.trim())) blocks.push(cur); cur = [line]; continue; }
    cur.push(line);
  }
  if (cur.some((l) => l.trim())) blocks.push(cur);
  const reqs = [];
  for (const b of blocks) {
    let name = '', reqIdx = -1;
    const asserts = [];
    for (let i = 0; i < b.length; i++) {
      const t = b[i].trim();
      const vm = b[i].match(varRe);
      if (vm) { vars[vm[1]] = vm[2].trim(); continue; }
      if (t.startsWith('###')) name = t.replace(/^###\\s*/, '').trim();
      else if (/^#\\s*@assert\\s+/i.test(t)) asserts.push(t.replace(/^#\\s*@assert\\s+/i, '').trim());
      else if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\\s+\\S+/i.test(t)) { reqIdx = i; break; }
    }
    if (reqIdx === -1) continue;
    const [method, url] = b[reqIdx].trim().split(/\\s+/);
    let i = reqIdx + 1, fullUrl = url;
    while (i < b.length && /^\\s*[?&]\\S+/.test(b[i])) { fullUrl += b[i].trim(); i++; }
    const headers = {};
    while (i < b.length && b[i].trim() !== '') {
      const l = b[i], t = l.trim();
      const vm = l.match(varRe);
      if (vm) { vars[vm[1]] = vm[2].trim(); i++; continue; }
      if (/^\\s*[#/]/.test(l)) {
        if (/^#\\s*@assert\\s+/i.test(t)) asserts.push(t.replace(/^#\\s*@assert\\s+/i, '').trim());
        i++; continue;
      }
      const c = l.indexOf(':');
      if (c > 0) headers[l.slice(0, c).trim()] = l.slice(c + 1).trim();
      i++;
    }
    const bodyLines = [];
    for (let j = i + 1; j < b.length; j++) {
      const t = b[j].trim();
      if (/^#\\s*@assert\\s+/i.test(t)) asserts.push(t.replace(/^#\\s*@assert\\s+/i, '').trim());
      else bodyLines.push(b[j]);
    }
    let cut = bodyLines.length;
    for (let k = bodyLines.length - 1; k >= 0; k--) {
      const t = bodyLines[k].trim();
      const vm = bodyLines[k].match(varRe);
      if (vm) { vars[vm[1]] = vm[2].trim(); cut = k; }
      else if (t === '' || /^[#/]/.test(t)) continue;
      else break;
    }
    bodyLines.length = cut;
    reqs.push({ name: name || \`\${method} \${fullUrl}\`, method: method.toUpperCase(), url: fullUrl, headers, body: bodyLines.join('\\n').trim(), asserts });
  }
  return { vars, reqs };
}

function sub(str, vars) {
  return String(str).replace(/\\{\\{\\s*([^}]+?)\\s*\\}\\}/g, (m, k) => {
    const key = k.trim().replace(/^\\$dotenv\\s+/, '');
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m;
  });
}

function splitAnd(expr) {
  const parts = [];
  let cur = '', q = null, esc = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (q) {
      cur += c;
      if (esc) esc = false;
      else if (c === '\\\\') esc = true;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === '&' && expr[i + 1] === '&') { if (cur.trim()) parts.push(cur.trim()); cur = ''; i++; }
    else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function getPath(obj, pathExpr) {
  const toks = [];
  for (const part of pathExpr.split('.')) {
    if (!part) continue;
    const br = /([^\\[\\]]+)|\\[(\\d+)\\]/g;
    let m;
    while ((m = br.exec(part)) !== null) toks.push(m[1] !== undefined ? m[1] : m[2]);
  }
  if (toks.length === 0) return undefined;
  let cur = obj;
  for (const k of toks) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function checkAsserts(asserts, status, bodyText) {
  if (asserts.length === 0) return status >= 200 && status < 400 ? null : \`HTTP \${status}\`;
  let parsed, jsonTried = false;
  const getJson = () => {
    if (!jsonTried) { jsonTried = true; try { parsed = JSON.parse(bodyText); } catch {} }
    return parsed;
  };
  for (const raw of asserts) {
    const clauses = splitAnd(raw.trim());
    if (clauses.length === 0) return \`Unsupported assertion (\${raw})\`;
    for (const a of clauses) {
      const sm = a.match(/(?:have\\.status\\(\\s*(\\d{3})\\s*\\)|^(?:res\\.)?status\\s*(?::\\s*eq|===?)\\s*(\\d{3})\\s*;?$|(?:getStatus\\(\\)|res\\.status)\\)?\\.to\\.(?:equal|eql)\\(\\s*(\\d{3})\\s*\\))/i);
      if (sm) {
        const exp = Number(sm[1] || sm[2] || sm[3]);
        if (status !== exp) return \`Expected status \${exp}, got \${status}\`;
        continue;
      }
      const im = a.match(/(?:to\\.include\\(\\s*(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')\\s*\\)|(?:^|\\s)body\\s+contains\\s+(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')|res\\.body:?\\s+contains\\s+(?:"((?:\\\\.|[^"\\\\])*)"\\s*$|'((?:\\\\.|[^'\\\\])*)'\\s*$|(.+?)\\s*$))/i);
      if (im) {
        const rawNeedle = im[1] ?? im[2] ?? im[3] ?? im[4] ?? im[5] ?? im[6];
        const needle = rawNeedle !== undefined ? rawNeedle.replace(/\\\\(['"\\\\])/g, '$1') : im[7];
        if (!bodyText.includes(needle)) return \`Body missing "\${needle}"\`;
        continue;
      }
      const eq = a.match(/^(?:res\\.body\\.)?([A-Za-z0-9_-]+(?:\\[\\d+\\])*(?:\\.[A-Za-z0-9_-]+(?:\\[\\d+\\])*)*)\\s*(?::\\s*eq|===?)\\s*(.+)$/);
      if (eq) {
        const cur = getPath(getJson(), eq[1]);
        const exp = eq[2].trim().replace(/^["']|["']$/g, '');
        if (cur === undefined || String(cur) !== exp) return \`Expected \${eq[1]}=\${exp}, got \${String(cur)}\`;
        continue;
      }
      return \`Unsupported assertion (\${a})\`;
    }
  }
  return null;
}

async function main() {
  const httpRaw = await fs.readFile(HTTP_FILE, 'utf8');
  const { vars, reqs } = parseHttp(httpRaw);
  const envVars = Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string'));
  let rows = [{}];
  if (CSV_FILE) {
    const csvRaw = await fs.readFile(CSV_FILE, 'utf8');
    const parsed = parseCsv(csvRaw);
    if (parsed.length > 0) rows = parsed;
  }
  const cases = [];
  let failures = 0;
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const scope = { ...vars, ...envVars, ...rows[rIdx] };
    for (const req of reqs) {
      const url = sub(req.url, scope);
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, sub(v, scope)]));
      const body = req.method !== 'GET' && req.method !== 'HEAD' && req.body ? sub(req.body, scope) : undefined;
      const t0 = Date.now();
      let failMsg = null;
      try {
        const res = await fetch(url, { method: req.method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const txt = await res.text();
        failMsg = checkAsserts(req.asserts, res.status, txt);
      } catch (err) {
        failMsg = err instanceof Error ? err.message : String(err);
      }
      if (failMsg) failures++;
      cases.push({ name: \`[row \${rIdx + 1}] \${req.method} \${req.name}\`, ms: Date.now() - t0, failMsg });
    }
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    \`<testsuite name="ReqBridge CI" tests="\${cases.length}" failures="\${failures}">\`,
    ...cases.map((c) => c.failMsg
      ? \`  <testcase name="\${escXml(c.name)}" time="\${(c.ms / 1000).toFixed(3)}"><failure message="\${escXml(c.failMsg)}">\${escXml(c.failMsg)}</failure></testcase>\`
      : \`  <testcase name="\${escXml(c.name)}" time="\${(c.ms / 1000).toFixed(3)}" />\`),
    '</testsuite>',
  ].join('\\n') + '\\n';
  await fs.writeFile(JUNIT_OUT, xml, 'utf8');
  console.log(\`ReqBridge CI finished: \${cases.length - failures}/\${cases.length} passed\`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
`;

  const csvStepLine = safeCsv ? `          REQBRIDGE_CSV_FILE: ${JSON.stringify(safeCsv)}\n` : '';
  const workflowYml = `name: ReqBridge API Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Run ReqBridge Local API CI Runner
        env:
          REQBRIDGE_HTTP_FILE: ${JSON.stringify(safeHttp)}
${csvStepLine}        run: node reqbridge-ci.mjs
      - name: Upload JUnit Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reqbridge-junit-results
          path: reqbridge-results.xml
`;

  return { runnerJs, workflowYml };
}
