import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  getExtensionBundlePath,
  getVsixPath,
  loadCoreModule,
  loadExtensionPackageJson,
  loadLandingFiles,
} from '../lib/contract-loader.mjs';
import { createDomSandbox, createLandingSandbox } from '../lib/dom-sandbox.mjs';
import { createMockHttpServer } from '../lib/mock-http.mjs';
import {
  assertMergedOrdersOpenApiBlock,
  checkTrialBlocked,
  findRunnerUrlInput,
  getExtensionDir,
  getLatencyMetrics,
  isProActive,
  isStatusDrift,
  makeResponseSample,
  obtainSignedTestLicense,
  readFixture,
  tamperSignedLicenseKey,
  withTempWorkDir,
} from '../lib/test-helpers.mjs';
import { createMockTextDocument, loadExtensionWithMockHost } from '../lib/vscode-host-mock.mjs';
import { parseZipBuffer } from '../lib/zip-reader.mjs';

const execFileAsync = promisify(execFile);

// ============================================================================
// F2: Multi-Format Parsers & Transpilers — Edge & Security Cases (6 tests)
// ============================================================================

test('[T2][F2] T2-F2-01 malformed JSON or Postman JSON missing item throws typed ParseError', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');

  assert.throws(
    () => parseInputCollection('{ bad json', 'postman'),
    (err) => err instanceof Error && err.name === 'ParseError',
    'Expected typed ParseError on invalid JSON',
  );

  assert.throws(
    () => parseInputCollection(JSON.stringify({ info: { name: 'Broken' } }), 'postman'),
    (err) => err instanceof Error && err.name === 'ParseError',
    'Expected typed ParseError when Postman collection lacks item array',
  );
});

test('[T2][F2] T2-F2-02 empty/whitespace input, invalid hintFormat, or empty .bru throws typed ParseError', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');

  for (const [input, hint] of [
    ['', 'auto'],
    ['   \n\t  ', 'http'],
    ['meta {\n  name: Empty\n}', 'bruno'],
    ['random unstructured text without method', 'auto'],
  ]) {
    assert.throws(
      () => parseInputCollection(input, hint),
      (err) => err instanceof Error && err.name === 'ParseError',
      `Expected typed ParseError for hint=${hint}`,
    );
  }
});

test('[T2][F2] T2-F2-03 secret hygiene: raw live secrets are not leaked verbatim into .env.example defaults', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toHttpFile } = await loadCoreModule('transpiler');

  const postmanWithSecrets = JSON.stringify({
    info: { name: 'Secrets Check', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [
      { key: 'baseUrl', value: 'https://api.example.com' },
      { key: 'stripeSecret', value: 'sk_live_51RealLookingSecretValue999999' },
    ],
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: 'ghp_SecretTokenShouldBeRedacted12345', type: 'string' }],
    },
    item: [
      {
        name: 'Charge',
        request: {
          method: 'POST',
          header: [{ key: 'X-Api-Key', value: 'secret_inline_header_value_999' }],
          url: { raw: '{{baseUrl}}/charge' },
        },
      },
    ],
  });

  const col = parseInputCollection(postmanWithSecrets, 'postman');
  const { envExample } = toHttpFile(col);
  assert.doesNotMatch(envExample, /sk_live_51RealLookingSecretValue999999/, '.env.example must not leak live secret values');
  assert.doesNotMatch(envExample, /ghp_SecretTokenShouldBeRedacted12345/, '.env.example must not leak bearer tokens');
});

test('[T2][F2] T2-F2-04 unicode, 5-level nested folders, empty body, and YAML special chars escape cleanly', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toHttpFile, toOpenApiYaml } = await loadCoreModule('transpiler');

  const deep = {
    info: { name: 'Unicode: 订单 #1 "Prod"' },
    item: [
      {
        name: 'L1',
        item: [
          {
            name: 'L2',
            item: [
              {
                name: 'L3',
                item: [
                  {
                    name: 'L4',
                    item: [
                      {
                        name: 'L5: Create "Order" #special 🚀',
                        request: {
                          method: 'POST',
                          url: { raw: 'https://api.example.com/v1/orders' },
                          body: { mode: 'raw', raw: '' },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const col = parseInputCollection(JSON.stringify(deep), 'postman');
  assert.deepEqual(col.requests[0].folder, ['L1', 'L2', 'L3', 'L4']);

  const { httpContent } = toHttpFile(col);
  const yaml = toOpenApiYaml(col);
  assert.ok(httpContent.includes('🚀'));
  assert.ok(yaml.includes('openapi: 3.1.0') || yaml.includes('openapi: "3.1.0"'));
  // Ensure summary with colon/quotes is quoted/escaped in YAML
  assert.match(yaml, /summary:\s*["'].*L5: Create.*["']/);
});

test('[T2][F2] T2-F2-05 query params, path params, and apikey-in-query map to OpenAPI parameters & securitySchemes', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toOpenApiYaml } = await loadCoreModule('transpiler');

  const col = parseInputCollection(
    JSON.stringify({
      info: { name: 'Query Auth API' },
      auth: {
        type: 'apikey',
        apikey: [
          { key: 'key', value: 'api_key' },
          { key: 'value', value: '{{key}}' },
          { key: 'in', value: 'query' },
        ],
      },
      item: [
        {
          name: 'Get Item',
          request: {
            method: 'GET',
            url: {
              raw: 'https://api.example.com/items/{itemId}?expand=true',
              query: [{ key: 'expand', value: 'true' }],
            },
          },
        },
      ],
    }),
    'postman',
  );

  const yaml = toOpenApiYaml(col);
  assert.ok(yaml.includes('parameters:'), 'Expected parameters block for path/query params');
  assert.ok(yaml.includes('itemId') && yaml.includes('expand'));
  assert.ok(yaml.includes('securitySchemes:'));
  assert.ok(yaml.includes('apiKey') || yaml.includes('apikey'));
});

test('[T2][F2] T2-F2-06 parseBrunoDirectory rejects or ignores path-traversal entries and non-.bru files safely', async () => {
  const { parseBrunoDirectory } = await loadCoreModule('parsers');

  const safeEntries = [
    { path: 'bruno.json', content: '{"version":"1","name":"Safe Bruno","type":"collection"}' },
    { path: 'README.md', content: '# ignore me' },
    { path: '../../etc/passwd.bru', content: 'meta {\n  name: Evil\n}\nget {\n  url: http://127.0.0.1/evil\n}' },
    { path: 'orders/get.bru', content: 'meta {\n  name: Get Order\n  type: http\n}\nget {\n  url: https://api.example.com/orders\n}' },
  ];

  let col;
  try {
    col = parseBrunoDirectory(safeEntries);
  } catch (err) {
    assert.ok(err instanceof Error && /traversal|invalid|unsafe|path/i.test(err.message));
    return;
  }

  assert.ok(col.requests.every((r) => r.name !== 'Evil'), 'Path-traversal .bru file must never be parsed into requests');
  assert.equal(col.requests.length, 1);
  assert.equal(col.requests[0].name, 'Get Order');
});

// ============================================================================
// F3: Local Batch Runner & Reports — Boundary & Error Cases (6 tests)
// ============================================================================

test('[T2][F3] T2-F3-01 malformed CSV (unclosed quote) or UTF-8 BOM + CRLF CSV handled cleanly', async () => {
  const { parseCsvRows } = await loadCoreModule('runner');

  const bomCrlf = '\uFEFForderId,customer\r\n"ord_1","Alice, Co"\r\n';
  const rows = parseCsvRows(bomCrlf);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].orderId, 'ord_1', 'UTF-8 BOM must be stripped from first CSV header');
  assert.equal(rows[0].customer, 'Alice, Co');

  assert.equal(parseCsvRows('').length, 0);

  // Unclosed quote should either throw a clean Error or parse deterministically without hanging
  let res;
  let caughtErr = null;
  try {
    res = parseCsvRows('a,b\n"unclosed,val\n');
  } catch (err) {
    caughtErr = err;
  }
  if (caughtErr !== null) {
    assert.ok(caughtErr instanceof Error);
  } else {
    assert.ok(Array.isArray(res));
  }
});

test('[T2][F3] T2-F3-02 unicode and special characters in CSV cells substitute accurately over HTTP', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { parseCsvRows, runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } }],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const rows = parseCsvRows('orderId,customer\n"ord_中文_1","张三 🚀 ""VIP"""\n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].customer, '张三 🚀 "VIP"', 'RFC-4180 doubled quotes must unescape cleanly');
    const report = await runBatch(postReq, rows, { baseUrl: server.baseUrl, apiToken: 'tok' }, { concurrency: 1, timeoutMs: 2000 });

    assert.equal(report.passed ?? report.passedCount, 1);
    const reqBody = server.stats().requests[0].body;
    assert.ok(reqBody.includes('ord_中文_1'));
    assert.ok(reqBody.includes('张三 🚀'));
    assert.ok(reqBody.includes('"VIP"') || reqBody.includes('\\"VIP\\"'), 'Quotes around VIP must be preserved in executed request payload');
  } finally {
    await server.close();
  }
});

test('[T2][F3] T2-F3-03 request timeout aborts slow row cleanly while remaining fast rows complete', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        handler: async ({ parsedBody, res }) => {
          if (parsedBody?.orderId === 'slow') {
            await new Promise((r) => setTimeout(r, 350));
          }
          if (!res.writableEnded) {
            res.writeHead(201, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
          }
        },
      },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const report = await runBatch(
      postReq,
      [{ orderId: 'slow', customer: 'A' }, { orderId: 'fast', customer: 'B' }],
      { baseUrl: server.baseUrl, apiToken: 'tok' },
      { concurrency: 1, timeoutMs: 70 },
    );

    assert.equal(report.failed ?? report.failedCount, 1);
    assert.equal(report.passed ?? report.passedCount, 1);
  } finally {
    await server.close();
  }
});

test('[T2][F3] T2-F3-04 HTTP 500, ECONNREFUSED, and non-JSON responses fail individual rows without crashing runBatch', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 500, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } }],
  });
  const deadServer = await createMockHttpServer();
  const deadBaseUrl = deadServer.baseUrl;
  await deadServer.close();

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');

    const r1 = await runBatch(postReq, [{ orderId: '1', customer: 'A' }], { baseUrl: server.baseUrl, apiToken: 'tok' }, { timeoutMs: 1000 });
    assert.equal(r1.failed ?? r1.failedCount, 1);

    const r2 = await runBatch(postReq, [{ orderId: '1', customer: 'A' }], { baseUrl: deadBaseUrl, apiToken: 'tok' }, { timeoutMs: 1000 });
    assert.equal(r2.failed ?? r2.failedCount, 1);
  } finally {
    await server.close();
  }
});

test('[T2][F3] T2-F3-05 empty requests or empty rows yields zero-count BatchReport with no NaN metrics', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch } = await loadCoreModule('runner');
  const col = parseInputCollection(readFixture('sample.http'), 'http');

  const report = await runBatch(col.requests, [], { baseUrl: 'http://127.0.0.1:1' }, { timeoutMs: 500 });
  const { p50, p95 } = getLatencyMetrics(report);
  const totalExec = report.totalExecutions ?? report.total ?? report.totalCount;

  assert.equal(typeof totalExec, 'number', 'BatchReport must include numeric totalExecutions');
  assert.equal(totalExec, 0);
  assert.equal(typeof p50, 'number', 'BatchReport must include numeric p50 latency');
  assert.equal(typeof p95, 'number', 'BatchReport must include numeric p95 latency');
  assert.equal(Number.isNaN(p50), false);
  assert.equal(Number.isNaN(p95), false);
});

test('[T2][F3] T2-F3-06 exportJUnitXml & exportBatchMarkdown escape XML meta-characters and Markdown pipes', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch, exportJUnitXml, exportBatchMarkdown } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 500, body: '<err & "bad">' }],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    postReq[0].name = 'Create <Order> & "Check" | Pipe';

    const report = await runBatch(
      postReq,
      [{ orderId: 'id_<1>&"x"', customer: 'A|B' }],
      { baseUrl: server.baseUrl, apiToken: 'tok' },
      { timeoutMs: 1000 },
    );

    const xml = exportJUnitXml(report);
    const md = exportBatchMarkdown(report);
    assert.ok(!xml.includes('<Order>'), 'Raw <Order> must be XML-escaped in JUnit output');
    assert.ok(xml.includes('&lt;') || xml.includes('&amp;'));
    assert.equal(typeof md, 'string');
    assert.ok(md.includes('Create <Order> & "Check" \\| Pipe'), 'Markdown report must escape | in requestName');
    const failureRow = md.split(/\r?\n/).find((line) => line.startsWith('| 1 | POST '));
    assert.ok(failureRow, 'Expected Markdown failure table row for row 1');
    assert.equal(
      failureRow.match(/(?<!\\)\|/g)?.length,
      5,
      `Expected valid 4-column Markdown row without unescaped |, got: ${failureRow}`,
    );
  } finally {
    await server.close();
  }
});

// ============================================================================
// F4: Staging vs Prod Diff Engine — Edge & Security Cases (6 tests)
// ============================================================================

test('[T2][F4] T2-F4-01 malformed or non-JSON body in staging/prod handled gracefully without SyntaxError', async () => {
  const { diffResponses } = await loadCoreModule('diff');

  const report = diffResponses(
    'GET /health',
    makeResponseSample(200, 15, 'OK plain text'),
    makeResponseSample(502, 25, '<html>502 Bad Gateway</html>'),
  );

  assert.ok(report && typeof report === 'object');
  assert.equal(isStatusDrift(report), true);
});

test('[T2][F4] T2-F4-02 null vs {} vs [] vs falsy primitives (0, false, "") distinguished accurately', async () => {
  const { diffResponses } = await loadCoreModule('diff');

  const r1 = diffResponses(
    'GET /falsy',
    makeResponseSample(200, 10, { count: 0, ok: false, label: '', obj: null, arr: [] }),
    makeResponseSample(200, 10, { count: 0, ok: false, label: '', obj: {}, arr: [] }),
  );

  const entries = r1.entries || [];
  assert.equal(entries.some((e) => e.kind === 'missing_key' && (e.path.includes('count') || e.path.includes('ok'))), false, 'Falsy 0/false must not be flagged as missing_key');
  assert.ok(entries.some((e) => e.kind === 'type_shift' && e.path.includes('obj')) || (r1.typeShifts?.length ?? 0) >= 1, 'null vs {} type drift must be detected');
});

test('[T2][F4] T2-F4-03 empty array [] vs populated array [{id:1}] and element type shift handled cleanly', async () => {
  const { diffResponses } = await loadCoreModule('diff');

  const r1 = diffResponses(
    'GET /items',
    makeResponseSample(200, 20, { items: [] }),
    makeResponseSample(200, 20, { items: [{ id: 1 }] }),
  );
  assert.ok(r1 && typeof r1 === 'object');

  const r2 = diffResponses(
    'GET /items2',
    makeResponseSample(200, 20, { items: [{ price: '19.00' }] }),
    makeResponseSample(200, 20, { items: [{ price: 1900 }] }),
  );
  assert.ok(JSON.stringify(r2).includes('price'));
});

test('[T2][F4] T2-F4-04 deeply nested JSON (6+ levels) and Unicode keys diff cleanly', async () => {
  const { diffResponses } = await loadCoreModule('diff');

  const stg = { l1: { l2: { l3: { l4: { l5: { l6: { '价格': '19' } } } } } } };
  const prod = { l1: { l2: { l3: { l4: { l5: { l6: { '价格': 19 } } } } } } };

  const report = diffResponses('GET /deep', makeResponseSample(200, 12, stg), makeResponseSample(200, 10, prod));
  assert.equal(report.hasBreakingChanges, true);
  assert.ok(JSON.stringify(report).includes('价格'));
});

test('[T2][F4] T2-F4-05 prototype-pollution keys (__proto__, constructor, toString) do not corrupt Object.prototype', async () => {
  const { diffResponses } = await loadCoreModule('diff');

  const rawEvil = '{"__proto__":{"polluted":true},"constructor":"bad","toString":123}';
  const report = diffResponses(
    'POST /evil',
    makeResponseSample(200, 10, rawEvil),
    makeResponseSample(200, 10, '{"safe":true}'),
  );

  assert.ok(report && typeof report === 'object');
  assert.equal(({}).polluted, undefined, 'Object.prototype must remain unpolluted');
});

test('[T2][F4] T2-F4-06 empty bodies and zero baseline latency produce valid DiffReport without NaN or Infinity', async () => {
  const { diffResponses } = await loadCoreModule('diff');

  const report = diffResponses(
    'DELETE /v2/orders/1',
    makeResponseSample(204, 5, ''),
    makeResponseSample(204, 0, ''),
  );

  assert.equal(report.latencyDeltaMs, 5);
  assert.doesNotMatch(JSON.stringify(report), /NaN|Infinity/);
});

// ============================================================================
// F5: CI/CD Exporter — Security, Exit Code & Edge Cases (6 tests)
// ============================================================================

test('[T2][F5] T2-F5-01 shell metacharacters or path traversal in filenames rejected or neutralized safely', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');

  for (const [httpName, csvName] of [
    ['../../etc/passwd; rm -rf /.http', 'evil`id`.csv'],
    ['', undefined],
    ['   ', undefined],
    ['requests.http', ''],
    ['requests.http', '   '],
    ['/etc/passwd.http', undefined],
    ['\\windows\\evil.http', undefined],
    ['C:\\evil.http', undefined],
    ['req\0.http', undefined],
    ['requests.http', '$(id).csv'],
    ['req\nname.http', 'data|cat.csv'],
    ['requests.http', '"quoted".csv'],
  ]) {
    assert.throws(
      () => exportCiBundle(httpName, csvName),
      Error,
      `Expected unsafe CI filename (${JSON.stringify(httpName)}, ${JSON.stringify(csvName)}) to throw Error`,
    );
  }

  for (const [httpName, csvName] of [
    ['requests.http', undefined],
    ['sub/requests.http', 'data/orders-batch.csv'],
    ['requests.http', 'sample-data.csv'],
  ]) {
    const bundle = exportCiBundle(httpName, csvName);
    assert.ok(bundle.runnerJs.includes(httpName));
    assert.ok(bundle.workflowYml.includes(httpName));
    if (csvName) assert.ok(bundle.workflowYml.includes(csvName));
  }
});

test('[T2][F5] T2-F5-02 exported runnerJs exits non-zero when loopback server returns HTTP 500', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/v2/orders', status: 500, body: { error: 'boom' } },
      { method: 'POST', path: '/v2/orders', status: 500, body: { error: 'boom' } },
    ],
  });

  try {
    await withTempWorkDir('ci-fail', async (dir) => {
      const httpText = readFixture('sample.http').replace(/http:\/\/127\.0\.0\.1:8787/g, server.baseUrl);
      fs.writeFileSync(path.join(dir, 'sample.http'), httpText, 'utf8');
      const { runnerJs } = exportCiBundle('sample.http');
      const runnerFile = path.join(dir, 'runner.mjs');
      fs.writeFileSync(runnerFile, runnerJs, 'utf8');

      await assert.rejects(
        async () => await execFileAsync(process.execPath, [runnerFile], { cwd: dir, timeout: 10000 }),
        (err) => err && typeof err.code === 'number' && err.code !== 0,
        'CI runnerJs must exit non-zero on assertion/HTTP failure',
      );
    });
  } finally {
    await server.close();
  }
});

test('[T2][F5] T2-F5-03 omitting csvFileName produces single-pass runnerJs/workflowYml with no undefined literal', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { runnerJs, workflowYml } = exportCiBundle('smoke.http');

  assert.doesNotMatch(runnerJs, /--data\s+undefined|["']undefined["']\.csv/);
  assert.doesNotMatch(workflowYml, /\bundefined\b/);
});

test('[T2][F5] T2-F5-04 generated runnerJs contains zero hardcoded secrets, telemetry, or cloud endpoints', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { runnerJs } = exportCiBundle('smoke.http', 'data.csv');

  assert.doesNotMatch(runnerJs, /sk_live_|ghp_|api\.creem\.io|telemetry|mixpanel|amplitude/i);
});

test('[T2][F5] T2-F5-05 generated workflowYml avoids untrusted github.event expression injection', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { workflowYml } = exportCiBundle('smoke.http', 'data.csv');

  assert.doesNotMatch(workflowYml, /\$\{\{\s*github\.event\.(issue|pull_request|comment|head_commit)\./);
});

test('[T2][F5] T2-F5-06 filenames with spaces and subdirectories are properly quoted in runnerJs and workflowYml', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { runnerJs, workflowYml } = exportCiBundle('api/orders v2.http', 'fixtures/smoke data.csv');

  assert.ok(runnerJs.includes('orders v2.http'));
  assert.ok(workflowYml.includes('orders v2.http'));
  assert.ok(workflowYml.includes('smoke data.csv'));
});

// ============================================================================
// F6: Dual License Gate — Security, Tamper & Boundary Cases (6 tests)
// ============================================================================

test('[T2][F6] T2-F6-01 tampered offline signed key (byte-level flip) fails verification', async () => {
  const licenseMod = await loadCoreModule('license');
  const { key: validKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 'e2e-machine-001');

  const parts = validKey.split('.');
  let tamperedKey;
  if (parts.length === 3) {
    const origSig = parts[2];
    const tamperedBuf = Buffer.from(origSig, 'base64url');
    assert.ok(tamperedBuf.length > 0, 'Expected non-empty decoded signature');
    tamperedBuf[0] ^= 0xff;
    const tamperedSig = tamperedBuf.toString('base64url');
    assert.notEqual(
      Buffer.compare(Buffer.from(origSig, 'base64url'), Buffer.from(tamperedSig, 'base64url')),
      0,
      'Tampered signature bytes must differ from original signature bytes',
    );
    tamperedKey = `${parts[0]}.${parts[1]}.${tamperedSig}`;
  } else {
    tamperedKey = tamperSignedLicenseKey(validKey);
  }

  const status = await licenseMod.verifyLicenseKey(tamperedKey, 'e2e-machine-001', verifyOpts);
  assert.equal(isProActive(status), false, 'Tampered license key must never unlock Pro');
});

test('[T2][F6] T2-F6-02 expired license key is rejected cleanly', async () => {
  const licenseMod = await loadCoreModule('license');
  const { key: expiredKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 'e2e-machine-001', {
    expiresAt: '2020-01-01T00:00:00.000Z',
  });
  const status = await licenseMod.verifyLicenseKey(expiredKey, 'e2e-machine-001', verifyOpts);

  assert.equal(isProActive(status), false, 'Expired license key must not unlock Pro');
});

test('[T2][F6] T2-F6-03 garbage, null-byte, and oversized (10KB) license keys fail closed without throwing', async () => {
  const { verifyLicenseKey } = await loadCoreModule('license');

  for (const bad of ['INVALID', 'RB-PRO-\0-INJECT', 'X'.repeat(10240)]) {
    const status = await verifyLicenseKey(bad, 'e2e-machine-001', { onlineVerify: false });
    assert.equal(isProActive(status), false);
  }
});

test('[T2][F6] T2-F6-04 Free Core trial boundary allows <=10 rows & <=3 runs/day, blocks 11 rows & 4th run', async () => {
  const licenseMod = await loadCoreModule('license');
  const status = await licenseMod.verifyLicenseKey('', 'e2e-machine-001', { onlineVerify: false });

  assert.equal(checkTrialBlocked(licenseMod, status, 10, 3, '2026-11-26'), false);
  assert.equal(checkTrialBlocked(licenseMod, status, 11, 1, '2026-11-26'), true);
  assert.equal(checkTrialBlocked(licenseMod, status, 5, 4, '2026-11-26'), true);
  if (typeof licenseMod.checkTrialAllowance === 'function') {
    const nextDay = licenseMod.checkTrialAllowance(status, { date: '2026-11-26', batchRunsToday: 3 }, 5, '2026-11-27');
    assert.equal(nextDay.allowed, true, 'Next UTC date must reset daily counter');
  }
});

test('[T2][F6] T2-F6-05 mismatched machineId fails machine-bound offline license check', async () => {
  const licenseMod = await loadCoreModule('license');
  const { key, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 'machine-alpha');
  const status = await licenseMod.verifyLicenseKey(key, 'machine-beta-unauthorized', verifyOpts);

  assert.equal(isProActive(status), false, 'Machine-bound key must not activate on mismatched machineId');
});

test('[T2][F6] T2-F6-06 onlineVerify fails closed on HTTP 500, ECONNREFUSED, or malformed JSON', async () => {
  const { verifyLicenseKey } = await loadCoreModule('license');
  const server = await createMockHttpServer({
    routes: [
      { method: 'POST', path: '/v1/licenses/validate', status: 500, body: 'not-json' },
      { method: 'POST', path: '/v1/licenses/activate', status: 500, body: 'not-json' },
      { method: 'POST', path: '/v2/licenses/verify', status: 500, body: 'not-json' },
    ],
  });
  const deadServer = await createMockHttpServer();
  const deadBaseUrl = deadServer.baseUrl;
  await deadServer.close();

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const targetBase = parsed.hostname === '127.0.0.1' ? `${parsed.protocol}//${parsed.host}` : server.baseUrl;
    return origFetch(`${targetBase}${parsed.pathname}${parsed.search}`, init);
  };

  try {
    const status500 = await verifyLicenseKey('CREEM-UNVERIFIED-KEY', 'e2e-machine', {
      onlineVerify: true,
      apiBaseUrl: server.baseUrl,
    });
    assert.equal(isProActive(status500), false);

    const gumStatus500 = await verifyLicenseKey('GUMROAD-UNVERIFIED-KEY', 'e2e-machine', {
      onlineVerify: true,
      provider: 'gumroad',
      apiBaseUrl: server.baseUrl,
    });
    assert.equal(isProActive(gumStatus500), false);

    const statusConnRefused = await verifyLicenseKey('CREEM-UNVERIFIED-KEY', 'e2e-machine', {
      onlineVerify: true,
      apiBaseUrl: deadBaseUrl,
    });
    assert.equal(isProActive(statusConnRefused), false);
  } finally {
    globalThis.fetch = origFetch;
    await server.close();
  }
});

// ============================================================================
// F7: VS Code Extension & .vsix — Packaging, Security & Lifecycle (6 tests)
// ============================================================================

test('[T2][F7] T2-F7-01 .vsix contains zero excluded bloat (node_modules, src, test, .env, .git)', () => {
  const zip = parseZipBuffer(fs.readFileSync(getVsixPath()));
  const forbidden = /(^|\/)(node_modules|src|test|\.git|\.env)(\/|$)/i;
  const badEntries = zip.entries.filter((e) => forbidden.test(e.name)).map((e) => e.name);
  assert.deepEqual(badEntries, [], `Excluded bloat found in .vsix: ${badEntries.join(', ')}`);
});

test('[T2][F7] T2-F7-02 .vsix has zero path-traversal entries and bounded size < 5 MB', () => {
  const vsixPath = getVsixPath();
  const buf = fs.readFileSync(vsixPath);
  assert.ok(buf.length < 5 * 1024 * 1024, `.vsix size too large: ${buf.length} bytes`);
  const zip = parseZipBuffer(buf, { rejectPathTraversal: true });
  assert.ok(zip.entries.length >= 5);
});

test('[T2][F7] T2-F7-03 pure-Node ZIP parser rejects truncated and CRC32-tampered real .vsix buffers', () => {
  const origBuf = fs.readFileSync(getVsixPath());
  assert.throws(
    () => parseZipBuffer(origBuf.subarray(0, Math.max(0, origBuf.length - 10))),
    (err) => err?.code === 'ZIP_TRUNCATED' || err?.code === 'ZIP_EOCD_MISSING',
  );

  const badCrcBuf = Buffer.from(origBuf);
  const minOffset = Math.max(0, badCrcBuf.length - 65557);
  let eocdOffset = -1;
  for (let i = badCrcBuf.length - 22; i >= minOffset; i -= 1) {
    if (badCrcBuf.readUInt32LE(i) === 0x06054b50 && i + 22 + badCrcBuf.readUInt16LE(i + 20) === badCrcBuf.length) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, 'Expected valid EOCD in real .vsix');
  const cdOffset = badCrcBuf.readUInt32LE(eocdOffset + 16);
  assert.equal(badCrcBuf.readUInt32LE(cdOffset), 0x02014b50, 'Expected Central Directory signature in real .vsix');
  badCrcBuf[cdOffset + 16] ^= 0xff;
  assert.throws(() => parseZipBuffer(badCrcBuf), (err) => err?.code === 'ZIP_CRC_MISMATCH');
});

test('[T2][F7] T2-F7-04 extension/package.json has no leaked secrets/PATs and no dead file paths', () => {
  const pkg = loadExtensionPackageJson();
  const raw = JSON.stringify(pkg);
  assert.doesNotMatch(raw, /ghp_|sk_live_|vsce_pat|AZURE_PAT/i);

  const extDir = getExtensionDir();
  assert.equal(fs.existsSync(path.resolve(extDir, pkg.main)), true, `Dead package.json main path: ${pkg.main}`);
  if (pkg.icon) {
    assert.equal(fs.existsSync(path.resolve(extDir, pkg.icon)), true, `Dead package.json icon path: ${pkg.icon}`);
  }
});

test('[T2][F7] T2-F7-05 CodeLensProvider returns [] gracefully on empty or malformed .http documents', async () => {
  const { exports, host } = loadExtensionWithMockHost({ filePath: getExtensionBundlePath() });
  await exports.activate(host.context);

  for (const content of ['', '   \n\n  ', 'not an http request\n###\n   ']) {
    const doc = createMockTextDocument(content, 'empty.http', 'http');
    for (const entry of host.codeLensProviders) {
      const lenses = await entry.provider.provideCodeLenses(doc, { isCancellationRequested: false });
      assert.ok(Array.isArray(lenses));
      assert.equal(lenses.length, 0);
    }
  }
});

test('[T2][F7] T2-F7-06 extension deactivate() and context.subscriptions.dispose() run cleanly', async () => {
  const { exports, host } = loadExtensionWithMockHost({ filePath: getExtensionBundlePath() });
  await exports.activate(host.context);
  host.disposeSubscriptions();
  if (typeof exports.deactivate === 'function') {
    await exports.deactivate();
  }
});

// ============================================================================
// F8: Web App (landing/demo.js) — Negative, Security & XSS Cases (6 tests)
// ============================================================================

test('[T2][F8] T2-F8-01 malformed JSON shows status-err without breaking subsequent valid conversion', async () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);
  try {
    sandbox.setValue('postman-input', '{ invalid json');
    await sandbox.flush(320);
    assert.equal(sandbox.el('converter-status').className, 'status-err');

    sandbox.setValue('postman-input', readFixture('postman-v21.json'));
    await sandbox.flush(320);
    assert.equal(sandbox.el('converter-status').className, 'status-ok');
  } finally {
    sandbox.dispose();
  }
});

test('[T2][F8] T2-F8-02 empty input or unrecognized JSON shows validation error with zero uncaught exceptions', async () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);
  try {
    for (const bad of ['', '   ', '{"hello":"world"}']) {
      sandbox.setValue('postman-input', bad);
      await sandbox.flush(320);
      assert.equal(sandbox.el('converter-status').className, 'status-err');
    }
  } finally {
    sandbox.dispose();
  }
});

test('[T2][F8] T2-F8-03 demo.js OpenAPI output merges non-adjacent shared paths without corrupting YAML indentation', async () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);
  try {
    sandbox.setValue('postman-input', readFixture('postman-v21.json'));
    await sandbox.flush(320);
    sandbox.click('.format-btn[data-format="openapi"]');
    const yaml = sandbox.el('converter-output').textContent;

    assertMergedOrdersOpenApiBlock(yaml, 'T2-F8-03');
  } finally {
    sandbox.dispose();
  }
});

test('[T2][F8] T2-F8-04 demo.js runner handles empty CSV and HTTP 500 / rejected fetch() cleanly', async () => {
  const { landingDir } = loadLandingFiles();
  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 500, body: { error: 'fail' } }],
  });
  let rejectFetch = false;
  const sandbox = createLandingSandbox(landingDir, {
    fetchImpl: async (url, init) => {
      if (rejectFetch) {
        throw new TypeError('Failed to fetch');
      }
      return globalThis.fetch(url, init);
    },
  });

  try {
    const csvEl = sandbox.el('#csv-input') || sandbox.el('#batch-csv-input') || sandbox.el('[data-panel="runner"] textarea');
    assert.ok(csvEl, 'Tab 2 must provide an editable CSV input');
    const urlEl = findRunnerUrlInput(sandbox);
    if (urlEl) sandbox.setValue(urlEl, `${server.baseUrl}/v2/orders`);

    // 1. Empty CSV (no data rows)
    sandbox.setValue(csvEl, '');
    sandbox.click('#run-batch-btn');
    await sandbox.flush(150);
    assert.match(sandbox.el('#batch-log').textContent, /empty csv|nothing to execute/i, 'Empty CSV must be handled cleanly');
    assert.equal(server.stats().requests.length, 0, 'Empty CSV must not issue HTTP requests');

    // 2. HTTP 500 response
    sandbox.setValue(csvEl, 'orderId\nord_err\n');
    sandbox.click('#run-batch-btn');
    await sandbox.flush(320);
    assert.match(sandbox.el('#batch-log').textContent, /500|fail|error/i, 'HTTP 500 row failure must be reported in batch log');

    // 3. Rejected fetch() (network/CORS failure)
    rejectFetch = true;
    sandbox.setValue(csvEl, 'orderId\nord_net\n');
    sandbox.click('#run-batch-btn');
    await sandbox.flush(320);
    const netLog = sandbox.el('#batch-log').textContent;
    assert.match(netLog, /failed to fetch|network|cors/i, 'Rejected fetch() error must be surfaced in batch log');
    assert.match(netLog, /0\/1 passed|1 failed/i, 'Rejected fetch() must be recorded as failed execution');
  } finally {
    sandbox.dispose();
    await server.close();
  }
});

test('[T2][F8] T2-F8-05 demo.js diff handles malformed staging/prod JSON with explicit error banner', async () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);
  try {
    const stgEl = sandbox.el('#diff-staging-input') || sandbox.el('#diff-staging');
    const prodEl = sandbox.el('#diff-prod-input') || sandbox.el('#diff-prod');
    assert.ok(stgEl.tagName === 'TEXTAREA' || sandbox.el('#diff-staging-input'), 'Editable staging JSON input required');

    sandbox.setValue(stgEl, '{ broken json');
    sandbox.setValue(prodEl, '{}');
    const runBtn = sandbox.el('#run-diff-btn');
    if (runBtn) runBtn.click();
    await sandbox.flush(320);

    assert.match(sandbox.el('#diff-banner').textContent, /error|invalid|json/i);
  } finally {
    sandbox.dispose();
  }
});

test('[T2][F8] T2-F8-06 XSS payload in collection/CSV/diff never lands unsanitized in innerHTML', async () => {
  const { landingDir } = loadLandingFiles();
  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 200, body: { ok: true } }],
  });
  const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });
  try {
    const xss = '<img src=x onerror=alert(1)>';

    // Tab 1: Postman collection input
    const col = JSON.parse(readFixture('postman-v21.json'));
    col.info.name = xss;
    sandbox.setValue('postman-input', JSON.stringify(col));
    await sandbox.flush(320);

    // Tab 2: CSV input
    const csvEl = sandbox.el('#csv-input');
    const urlEl = findRunnerUrlInput(sandbox);
    if (urlEl) sandbox.setValue(urlEl, `${server.baseUrl}/v2/orders`);
    sandbox.setValue(csvEl, `orderId,customer\n"${xss}","<script>alert(2)</script>"\n`);
    sandbox.click('#run-batch-btn');
    await sandbox.flush(320);

    // Tab 3: Staging vs Prod diff inputs
    const stgEl = sandbox.el('#diff-staging-input');
    const prodEl = sandbox.el('#diff-prod-input');
    sandbox.setValue(stgEl, JSON.stringify({ payload: xss, [xss]: 'injected' }));
    sandbox.setValue(prodEl, JSON.stringify({ payload: 'safe' }));
    sandbox.click('#run-diff-btn');
    await sandbox.flush(200);

    assert.equal(sandbox.getInnerHtmlWrites().length, 0, 'demo.js must never write to innerHTML across Tab 1/2/3');
    const writes = sandbox.getInnerHtmlWrites().map((w) => w.html).join('\n');
    assert.equal(writes.includes(xss), false, 'Unsanitized XSS HTML written to innerHTML');
    assert.ok(sandbox.el('#diff-result').textContent.includes(xss), 'Tab 3 diff must render XSS payload safely as textContent');
  } finally {
    sandbox.dispose();
    await server.close();
  }
});

// ============================================================================
// F9: Web Compliance, Copy & Asset Integrity — Negative Checks (6 tests)
// ============================================================================

test('[T2][F9] T2-F9-01 zero "$0 Charged Today" or "No card is charged today" vaporware copy in landing/*.html', () => {
  const { files } = loadLandingFiles();
  const htmlPages = ['index.html', 'checkout-personal.html', 'checkout-team.html', 'privacy.html', 'terms.html', 'refund.html'];
  for (const page of htmlPages) {
    const text = files[page].readText();
    assert.doesNotMatch(
      text,
      /\$0\s*charged\s*today|zero\s*card\s*charge\s*today|no\s*card\s*is\s*charged\s*today/i,
      `Vaporware "$0 charged today" copy found in ${page}`,
    );
  }
});

test('[T2][F9] T2-F9-02 zero mailto:-only dead-end primary checkout CTAs on checkout pages', () => {
  const { files } = loadLandingFiles();
  for (const page of ['checkout-personal.html', 'checkout-team.html']) {
    const html = files[page].readText();
    const sandbox = createDomSandbox({ htmlContent: html });
    try {
      const primaryAnchors = sandbox.all('a.btn-primary');
      const primaryButtons = sandbox.all('button.btn-primary, input.btn-primary');
      assert.ok(
        primaryAnchors.length + primaryButtons.length >= 1,
        `Expected at least one primary checkout CTA (.btn-primary) in ${page}`,
      );
      for (const anchor of primaryAnchors) {
        const href = (anchor.getAttribute('href') || '').trim();
        assert.ok(href.length > 0, `Primary checkout CTA in ${page} must have a non-empty href`);
        assert.doesNotMatch(href, /^mailto:/i, `Primary checkout CTA in ${page} must not be a mailto: dead end`);
      }
    } finally {
      sandbox.dispose();
    }
  }
});

test('[T2][F9] T2-F9-03 zero fake social proof or unfilled template placeholders in landing/', () => {
  const { files } = loadLandingFiles();
  for (const name of Object.keys(files)) {
    if (!files[name].exists) continue;
    const text = files[name].readText();
    assert.doesNotMatch(text, /lorem ipsum|★★★★★|\[PRODUCT_NAME\]|\[SUPPORT_EMAIL\]|\[REPLACE_/i, `Fake proof or placeholder in ${name}`);
  }
});

test('[T2][F9] T2-F9-04 zero external CDN/font links in landing HTML and CSS', () => {
  const { files } = loadLandingFiles();
  for (const name of ['index.html', 'styles.css', 'checkout-personal.html', 'checkout-team.html']) {
    const text = files[name].readText();
    assert.doesNotMatch(text, /(https?:)?\/\/(cdn\.|unpkg\.com|jsdelivr\.net|cdnjs\.|fonts\.googleapis\.com)/i);
  }
});

test('[T2][F9] T2-F9-05 zero sub-$12 pricing contradictions across landing HTML pages', () => {
  const { files } = loadLandingFiles();
  for (const name of ['index.html', 'checkout-personal.html', 'checkout-team.html', 'terms.html', 'refund.html']) {
    const text = files[name].readText();
    const suspicious = [];
    for (const match of text.matchAll(/\$(\d+(?:\.\d+)?)\b/g)) {
      const price = Number(match[1]);
      if (!(price > 0 && price < 12)) continue;
      const idx = match.index ?? 0;
      const before = text.slice(Math.max(0, idx - 16), idx);
      const after = text.slice(idx);
      const isGroupedThousands = /^\$\d{1,3},\d{3}\b/.test(after);
      const isCompetitorRange = /^\$3[–-]\$16\b/.test(after);
      const isSaveAmount = /\bsave\s+$/i.test(before);
      if (isGroupedThousands || isCompetitorRange || isSaveAmount) continue;
      const snippet = text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + match[0].length + 20)).replace(/\s+/g, ' ').trim();
      suspicious.push(`${match[0]} (${snippet})`);
    }
    assert.deepEqual(suspicious, [], `Unexpected sub-$12 pricing in ${name}: ${suspicious.join('; ')}`);
  }
});

test('[T2][F9] T2-F9-06 all HTML pages have lang="en", title, meta description, and valid #anchor targets', () => {
  const { files } = loadLandingFiles();
  for (const page of ['index.html', 'checkout-personal.html', 'checkout-team.html', 'privacy.html', 'terms.html', 'refund.html']) {
    const html = files[page].readText();
    assert.match(html, /<html[^>]+lang=["']en["']/i, `Missing lang="en" in ${page}`);
    assert.match(html, /<title>[^<]+<\/title>/i, `Missing <title> in ${page}`);
    assert.match(html, /<meta[^>]+name=["']description["']/i, `Missing meta description in ${page}`);

    const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]));
    const anchors = [...html.matchAll(/href=["']#([^"']+)["']/gi)].map((m) => m[1]);
    for (const anchor of anchors) {
      assert.ok(ids.has(anchor), `Broken #${anchor} anchor in ${page}`);
    }
  }
});
