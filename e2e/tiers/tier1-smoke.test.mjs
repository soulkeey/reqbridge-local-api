import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import vm from 'node:vm';
import {
  loadCoreModule,
  loadCoreModuleWithPath,
  loadExtensionArtifacts,
  loadExtensionPackageJson,
  getExtensionBundlePath,
  getVsixPath,
  loadLandingFiles,
  REQUIRED_LANDING_FILES,
} from '../lib/contract-loader.mjs';
import { createLandingSandbox } from '../lib/dom-sandbox.mjs';
import { createMockHttpServer } from '../lib/mock-http.mjs';
import {
  assertMergedOrdersOpenApiBlock,
  checkTrialBlocked,
  findRunnerUrlInput,
  getLatencyMetrics,
  isProActive,
  isStatusDrift,
  makeResponseSample,
  normalizeTier,
  obtainSignedTestLicense,
  readBrunoDirectoryFixture,
  readFixture,
  withTempWorkDir,
} from '../lib/test-helpers.mjs';
import { createMockTextDocument, loadExtensionWithMockHost } from '../lib/vscode-host-mock.mjs';
import { parseZipBuffer } from '../lib/zip-reader.mjs';

const execFileAsync = promisify(execFile);

// ============================================================================
// F2: Multi-Format Lossless Parsers & Transpilers (6 tests)
// ============================================================================

test('[T1][F2] T1-F2-01 parses Postman v2.1 nested folders, inherited auth, and noauth override', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const raw = readFixture('postman-v21.json');
  const col = parseInputCollection(raw, 'postman');

  assert.equal(col.name, 'ReqBridge E2E Orders Collection');
  assert.ok(Array.isArray(col.requests) && col.requests.length === 4, 'Expected 4 requests in Postman fixture');
  assert.ok(col.requests.every((r) => r.sourceFormat === 'postman'));

  const listOrders = col.requests.find((r) => r.name === 'List Orders');
  assert.ok(listOrders, 'List Orders request missing');
  assert.deepEqual(listOrders.folder, ['Orders']);
  assert.equal(listOrders.method, 'GET');
  assert.equal(listOrders.auth?.type, 'bearer');
  assert.ok(listOrders.query.some((q) => q.key === 'status' && q.value === 'paid'));
  assert.ok(listOrders.tests.length >= 1, 'Expected pm.test assertion preserved');

  const createCheckout = col.requests.find((r) => r.name === 'Create Checkout Session');
  assert.ok(createCheckout, 'Nested Checkout request missing');
  assert.deepEqual(createCheckout.folder, ['Orders', 'Checkout']);

  const health = col.requests.find((r) => r.name === 'Health Public');
  assert.ok(health, 'Health Public request missing');
  assert.equal(health.auth?.type, 'none', 'Child noauth must override collection bearer auth');
});

test('[T1][F2] T1-F2-02 parses Thunder Client JSON requests, headers, params, body, and excludes disabled headers', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const raw = readFixture('thunder-client.json');
  const col = parseInputCollection(raw, 'thunder');

  assert.ok(col.requests.length >= 2);
  assert.ok(col.requests.every((r) => r.sourceFormat === 'thunder'));

  const listReq = col.requests.find((r) => r.name === 'List Orders');
  assert.ok(listReq);
  assert.equal(listReq.method, 'GET');
  assert.equal(listReq.headers['X-Client'] || listReq.headers['x-client'], 'thunder');
  assert.equal(listReq.headers['X-Disabled'] || listReq.headers['x-disabled'], undefined, 'Disabled Thunder header should be excluded');
  assert.equal(listReq.auth?.type, 'bearer');

  const createReq = col.requests.find((r) => r.name === 'Create Order');
  assert.ok(createReq);
  assert.equal(createReq.method, 'POST');
  assert.ok(createReq.body?.raw?.includes('PRO-19'));
});

test('[T1][F2] T1-F2-03 parses Bruno single .bru and multi-file Bruno directory with inherited auth', async () => {
  const { parseInputCollection, parseBrunoDirectory } = await loadCoreModule('parsers');

  const singleCol = parseInputCollection(readFixture('bruno-single.bru'), 'bruno');
  assert.equal(singleCol.requests.length, 1);
  const single = singleCol.requests[0];
  assert.equal(single.sourceFormat, 'bruno');
  assert.equal(single.method, 'POST');
  assert.equal(single.auth?.type, 'bearer');
  assert.equal(single.headers['X-Request-Source'], 'bruno-single');
  assert.equal(single.headers['~X-Disabled-Header'], undefined);
  assert.equal(single.headers['X-Disabled-Header'], undefined);
  assert.ok(single.query.some((q) => q.key === 'dryRun' && q.value === 'false'));

  const dirCol = parseBrunoDirectory(readBrunoDirectoryFixture());
  assert.equal(dirCol.name, 'ReqBridge Bruno Directory');
  assert.equal(dirCol.requests.length, 2);
  assert.ok(dirCol.requests.every((r) => r.sourceFormat === 'bruno'));
  assert.ok(dirCol.requests.some((r) => r.folder.includes('orders')));
  assert.ok(dirCol.requests.every((r) => r.auth?.type === 'bearer'), 'Bruno collection.bru bearer auth must be inherited');
});

test('[T1][F2] T1-F2-04 parses .http file variables, request separators, headers, body, and assertions', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const col = parseInputCollection(readFixture('sample.http'), 'http');

  assert.equal(col.variables.baseUrl, 'http://127.0.0.1:8787');
  assert.equal(col.variables.apiToken, 'sample_bearer_token');
  assert.equal(col.requests.length, 2);
  assert.ok(col.requests.every((r) => r.sourceFormat === 'http'));
  assert.equal(col.requests[0].method, 'GET');
  assert.equal(col.requests[1].method, 'POST');
  assert.ok(col.requests[1].body?.raw?.includes('{{orderId}}'));
  assert.ok(col.requests[0].tests.length >= 1);
});

test('[T1][F2] T1-F2-05 transpiles CollectionSpec to deterministic .http and .env.example', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toHttpFile } = await loadCoreModule('transpiler');

  const col = parseInputCollection(readFixture('postman-v21.json'), 'postman');
  const out = toHttpFile(col);

  assert.equal(typeof out.httpContent, 'string');
  assert.equal(typeof out.envExample, 'string');
  assert.ok(out.httpContent.includes('###'), '.http must contain request delimiters');
  assert.ok(out.httpContent.includes('GET {{baseUrl}}/v2/orders'));
  assert.ok(out.httpContent.includes('POST {{baseUrl}}/v2/orders'));
  assert.ok(out.httpContent.includes('Authorization: Bearer'));
  assert.ok(out.envExample.includes('baseUrl=') || out.envExample.includes('BASE_URL=') || out.envExample.includes('apiToken=') || out.envExample.includes('API_TOKEN='));
});

test('[T1][F2] T1-F2-06 transpiles CollectionSpec to valid OpenAPI 3.1.0 YAML merging non-adjacent paths cleanly', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toOpenApiYaml } = await loadCoreModule('transpiler');

  const col = parseInputCollection(readFixture('postman-v21.json'), 'postman');
  const yaml = toOpenApiYaml(col);

  assert.ok(yaml.includes('openapi: 3.1.0') || yaml.includes('openapi: "3.1.0"'));
  assert.ok(yaml.includes('securitySchemes:'), 'OpenAPI 3.1 output must include components.securitySchemes');

  // Postman fixture has GET /v2/orders, POST /v2/checkout, POST /v2/orders (non-adjacent!)
  assertMergedOrdersOpenApiBlock(yaml, 'T1-F2-06');
});

// ============================================================================
// F3: Local CSV/JSON Batch Runner & Reports (6 tests)
// ============================================================================

test('[T1][F3] T1-F3-01 parseCsvRows parses RFC-4180 CSV with quoted commas and escaped quotes', async () => {
  const { parseCsvRows } = await loadCoreModule('runner');
  const rows = parseCsvRows(readFixture('batch-data.csv'));

  assert.equal(rows.length, 15);
  assert.equal(rows[0].orderId, 'ord_101');
  assert.equal(rows[0].customer, 'Alice, Bob');
  assert.equal(rows[0].note, 'Priority "VIP" tier');
  assert.equal(rows[0].expectedStatus, '201');
});

test('[T1][F3] T1-F3-02 runBatch executes real HTTP requests against 127.0.0.1 with {{var}} substitution', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { parseCsvRows, runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        handler: ({ res, parsedBody, req }) => {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: parsedBody?.orderId, customer: parsedBody?.customer, auth: req.headers.authorization }));
        },
      },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const rows = parseCsvRows(readFixture('batch-data.csv')).slice(0, 3);

    const report = await runBatch(postReq, rows, { baseUrl: server.baseUrl, apiToken: 'tok_live_test' }, { concurrency: 2, timeoutMs: 2000 });
    const stats = server.stats();

    assert.equal(stats.requests.length, 3);
    assert.equal(stats.requests[0].headers.authorization, 'Bearer tok_live_test');
    assert.equal(stats.requests[0].parsedBody.orderId, 'ord_101');
    assert.equal(stats.requests[0].parsedBody.customer, 'Alice, Bob');
    const passed = report.passedCount ?? report.passed;
    const failed = report.failedCount ?? report.failed;
    assert.equal(typeof passed, 'number', 'BatchReport must expose numeric passedCount/passed');
    assert.equal(typeof failed, 'number', 'BatchReport must expose numeric failedCount/failed');
    assert.equal(passed, 3);
    assert.equal(failed, 0);
  } finally {
    await server.close();
  }
});

test('[T1][F3] T1-F3-03 runBatch enforces concurrency cap against real loopback server', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { parseCsvRows, runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        delayMs: 35,
        status: 201,
        body: { ok: true },
      },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const rows = parseCsvRows(readFixture('batch-data.csv')).slice(0, 6);

    await runBatch(postReq, rows, { baseUrl: server.baseUrl, apiToken: 'tok' }, { concurrency: 2, timeoutMs: 2000 });
    const { maxInFlight, requests } = server.stats();

    assert.equal(requests.length, 6);
    assert.ok(maxInFlight <= 2, `Expected maxInFlight <= 2, got ${maxInFlight}`);
    assert.ok(maxInFlight >= 2, `Expected real concurrent requests (maxInFlight >= 2), got ${maxInFlight}`);
  } finally {
    await server.close();
  }
});

test('[T1][F3] T1-F3-04 runBatch computes p50/p95 latencies and records assertion failures', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch } = await loadCoreModule('runner');

  let callNum = 0;
  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        handler: async ({ res }) => {
          callNum += 1;
          await new Promise((r) => setTimeout(r, callNum === 3 ? 40 : 10));
          const status = callNum === 2 ? 500 : 201;
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status }));
        },
      },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const rows = [
      { orderId: '1', customer: 'A' },
      { orderId: '2', customer: 'B' },
      { orderId: '3', customer: 'C' },
      { orderId: '4', customer: 'D' },
    ];

    const report = await runBatch(postReq, rows, { baseUrl: server.baseUrl, apiToken: 'tok' }, { concurrency: 1, timeoutMs: 2000 });
    const { p50, p95 } = getLatencyMetrics(report);

    assert.equal(typeof p50, 'number');
    assert.equal(typeof p95, 'number');
    assert.ok(p50 >= 0 && p95 >= p50, `Invalid percentiles p50=${p50}, p95=${p95}`);
    assert.equal(report.failed ?? report.failedCount, 1, 'HTTP 500 row against @assert status == 201 must fail');
    assert.equal(report.passed ?? report.passedCount, 3);
  } finally {
    await server.close();
  }
});

test('[T1][F3] T1-F3-05 exportJUnitXml emits valid XML with testsuite, testcase, and failure tags', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch, exportJUnitXml } = await loadCoreModule('runner');

  let idx = 0;
  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        handler: ({ res }) => {
          idx += 1;
          res.writeHead(idx === 2 ? 500 : 201, { 'content-type': 'application/json' });
          res.end('{}');
        },
      },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const report = await runBatch(
      postReq,
      [{ orderId: '1', customer: 'A' }, { orderId: '2', customer: 'B' }],
      { baseUrl: server.baseUrl, apiToken: 'tok' },
      { concurrency: 1, timeoutMs: 2000 },
    );

    const xml = exportJUnitXml(report);
    assert.ok(xml.includes('<testsuite'));
    assert.ok(xml.includes('<testcase'));
    assert.ok(xml.includes('<failure'), 'Failed row must emit <failure> element in JUnit XML');
  } finally {
    await server.close();
  }
});

test('[T1][F3] T1-F3-06 exportBatchMarkdown outputs summary table, pass/fail counts, and p50/p95 stats', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch, exportBatchMarkdown } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } }],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const report = await runBatch(
      postReq,
      [{ orderId: '1', customer: 'A' }, { orderId: '2', customer: 'B' }],
      { baseUrl: server.baseUrl, apiToken: 'tok' },
      { concurrency: 2, timeoutMs: 2000 },
    );

    const md = exportBatchMarkdown(report);
    assert.equal(typeof md, 'string');
    assert.ok(md.includes('2') && /pass/i.test(md));
    assert.ok(/p50|p95/i.test(md), 'Markdown report must include p50/p95 latency metrics');
  } finally {
    await server.close();
  }
});

// ============================================================================
// F4: Staging vs Prod Schema-Drift Diff Engine (6 tests)
// ============================================================================

test('[T1][F4] T1-F4-01 diffResponses classifies identical payloads as non-breaking', async () => {
  const { diffResponses } = await loadCoreModule('diff');
  const report = diffResponses(
    'GET /v2/orders/{id}',
    makeResponseSample(200, 45, { id: 'ord_1', total: 1900, active: true }),
    makeResponseSample(200, 40, { id: 'ord_1', total: 1900, active: true }),
  );

  const hasBreaking = report.hasBreakingChanges ?? report.hasBreaking;
  assert.equal(typeof hasBreaking, 'boolean', 'DiffReport must define boolean hasBreakingChanges');
  assert.equal(hasBreaking, false);
  assert.equal(report.latencyDeltaMs, 5);
});

test('[T1][F4] T1-F4-02 diffResponses classifies additive staging keys as non-breaking additive diff', async () => {
  const { diffResponses } = await loadCoreModule('diff');
  const report = diffResponses(
    'GET /v1/users/me',
    makeResponseSample(200, 34, { user_id: 'u1', plan_tier: 'team_5_seat' }),
    makeResponseSample(200, 31, { user_id: 'u1' }),
  );

  const hasBreaking = report.hasBreakingChanges ?? report.hasBreaking;
  assert.equal(typeof hasBreaking, 'boolean', 'DiffReport must define boolean hasBreakingChanges');
  assert.equal(hasBreaking, false);
  const entries = report.entries || [];
  assert.ok(
    entries.some((e) => e.kind === 'added_key' && e.path.includes('plan_tier')) ||
      (report.addedKeys?.length ?? 0) >= 1,
  );
});

test('[T1][F4] T1-F4-03 diffResponses flags removed/missing keys in staging as breaking drift', async () => {
  const { diffResponses } = await loadCoreModule('diff');
  const report = diffResponses(
    'GET /v2/orders/ord_1',
    makeResponseSample(200, 50, { id: 'ord_1' }),
    makeResponseSample(200, 40, { id: 'ord_1', currency: 'USD' }),
  );

  assert.equal(report.hasBreakingChanges, true);
  assert.ok(JSON.stringify(report).includes('currency'));
});

test('[T1][F4] T1-F4-04 diffResponses detects nested JSON type shifts with field paths', async () => {
  const { diffResponses } = await loadCoreModule('diff');
  const report = diffResponses(
    'GET /v2/orders/ord_1',
    makeResponseSample(200, 226, { meta: { currency_code: 'USD' }, tags: { a: 1 } }),
    makeResponseSample(200, 42, { meta: { currency_code: 840 }, tags: ['a'] }),
  );

  const serialized = JSON.stringify(report);
  assert.equal(report.hasBreakingChanges, true);
  assert.ok(serialized.includes('currency_code'));
  assert.ok(serialized.includes('tags'));
});

test('[T1][F4] T1-F4-05 diffResponses detects status code drift and latency delta', async () => {
  const { diffResponses } = await loadCoreModule('diff');
  const report = diffResponses(
    'POST /v2/checkout',
    makeResponseSample(200, 68, { ok: true }),
    makeResponseSample(422, 59, { ok: false }),
  );

  assert.equal(isStatusDrift(report), true);
  assert.equal(report.latencyDeltaMs, 9);
});

test('[T1][F4] T1-F4-06 diffResponses provides PR-ready Markdown diff summary', async () => {
  const diffMod = await loadCoreModule('diff');
  const report = diffMod.diffResponses(
    'GET /v2/orders/ord_1',
    makeResponseSample(200, 226, { currency_code: 'USD' }),
    makeResponseSample(200, 42, { currency_code: 840 }),
  );

  const formatter = diffMod.formatDiffMarkdown || diffMod.exportDiffMarkdown;
  const md = report.markdown ?? (typeof formatter === 'function' ? formatter(report) : '');
  assert.equal(typeof md, 'string');
  assert.ok(md.length > 20, 'Diff Markdown summary must be non-empty');
  assert.ok(md.includes('currency_code'));
});

// ============================================================================
// F5: CI/CD Zero-Lock-In Exporter (6 tests)
// ============================================================================

test('[T1][F5] T1-F5-01 exportCiBundle returns non-empty runnerJs and workflowYml with zero SaaS lock-in', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const bundle = exportCiBundle('api.http');

  assert.equal(typeof bundle.runnerJs, 'string');
  assert.equal(typeof bundle.workflowYml, 'string');
  assert.ok(bundle.runnerJs.length > 100);
  assert.ok(bundle.workflowYml.length > 80);
  assert.doesNotMatch(bundle.runnerJs, /api\.getpostman\.com|thunderclient\.com|reqbridge\.io\/api/i);
});

test('[T1][F5] T1-F5-02 exported runnerJs passes Node syntax check with zero third-party npm imports', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { runnerJs } = exportCiBundle('api.http', 'data.csv');

  if (/\bimport\s+/.test(runnerJs)) {
    await withTempWorkDir('ci-syntax', async (dir) => {
      const f = path.join(dir, 'runner.mjs');
      fs.writeFileSync(f, runnerJs, 'utf8');
      await execFileAsync(process.execPath, ['--check', f], { cwd: dir, timeout: 5000 });
    });
  } else {
    new vm.Script(runnerJs, { filename: 'reqbridge-ci-runner.cjs' });
  }
  const importMatches = [...runnerJs.matchAll(/(?:import\s+[^'"]*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g)];
  for (const m of importMatches) {
    const spec = m[1] || m[2];
    assert.ok(spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'), `Disallowed third-party import in CI runnerJs: ${spec}`);
  }
});

test('[T1][F5] T1-F5-03 exported runnerJs executes as a child node process against 127.0.0.1 server and exits 0', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');

  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/v2/orders', status: 200, body: { items: [] } },
      { method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } },
    ],
  });

  try {
    await withTempWorkDir('ci-pass', async (dir) => {
      const httpText = readFixture('sample.http').replace(/http:\/\/127\.0\.0\.1:8787/g, server.baseUrl);
      fs.writeFileSync(path.join(dir, 'sample.http'), httpText, 'utf8');
      const { runnerJs } = exportCiBundle('sample.http');
      const runnerFile = path.join(dir, 'runner.mjs');
      fs.writeFileSync(runnerFile, runnerJs, 'utf8');

      const res = await execFileAsync(process.execPath, [runnerFile], { cwd: dir, timeout: 10000 });
      assert.equal(typeof res.stdout, 'string');
      assert.ok(server.stats().requests.length >= 2, 'CI runnerJs must issue real HTTP requests');
    });
  } finally {
    await server.close();
  }
});

test('[T1][F5] T1-F5-04 exportCiBundle wires CSV dataset execution into runnerJs and workflowYml', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { runnerJs, workflowYml } = exportCiBundle('orders.http', 'users.csv');

  assert.ok(runnerJs.includes('users.csv') || runnerJs.includes('csv'), 'runnerJs must support CSV file wiring');
  assert.ok(workflowYml.includes('orders.http'));
  assert.ok(workflowYml.includes('users.csv'));
});

test('[T1][F5] T1-F5-05 workflowYml contains valid GitHub Actions triggers, setup-node, and always() artifact upload', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { workflowYml } = exportCiBundle('orders.http', 'users.csv');

  assert.match(workflowYml, /^on:/m);
  assert.match(workflowYml, /^jobs:/m);
  assert.ok(workflowYml.includes('actions/checkout@'));
  assert.ok(workflowYml.includes('actions/setup-node@'));
  assert.ok(workflowYml.includes('if: always()'));
});

test('[T1][F5] T1-F5-06 exported runnerJs emits JUnit XML or structured summary output when executed', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');

  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/v2/orders', status: 200, body: { items: [] } },
      { method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } },
    ],
  });

  try {
    await withTempWorkDir('ci-junit', async (dir) => {
      const httpText = readFixture('sample.http').replace(/http:\/\/127\.0\.0\.1:8787/g, server.baseUrl);
      fs.writeFileSync(path.join(dir, 'sample.http'), httpText, 'utf8');
      const { runnerJs } = exportCiBundle('sample.http');
      const runnerFile = path.join(dir, 'runner.mjs');
      fs.writeFileSync(runnerFile, runnerJs, 'utf8');

      const { stdout } = await execFileAsync(process.execPath, [runnerFile], { cwd: dir, timeout: 10000 });
      const createdXml = fs.readdirSync(dir).filter((f) => f.endsWith('.xml'));
      assert.ok(
        createdXml.length > 0 || stdout.includes('<testsuite') || /passed|pass/i.test(stdout),
        'CI runner must produce JUnit XML file or structured summary output',
      );
    });
  } finally {
    await server.close();
  }
});

// ============================================================================
// F6: Dual License Gate & Optional BYOK (6 tests)
// ============================================================================

test('[T1][F6] T1-F6-01 empty/missing key returns Free Core status enforcing 10 rows / 3 runs per day', async () => {
  const { verifyLicenseKey } = await loadCoreModule('license');
  const status = await verifyLicenseKey('', 'e2e-machine-001', { onlineVerify: false });

  assert.equal(normalizeTier(status), 'free');
  assert.equal(isProActive(status), false);
  const maxRows = status.limits?.maxBatchCsvRows ?? status.maxRows ?? status.rowLimit;
  const maxRuns = status.limits?.maxBatchRunsPerDay ?? status.maxRunsPerDay ?? status.dailyRunLimit;
  assert.equal(maxRows, 10);
  assert.equal(maxRuns, 3);
});

test('[T1][F6] T1-F6-02 valid signed offline personal key unlocks Pro unlimited runs', async () => {
  const licenseMod = await loadCoreModule('license');
  const { key, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 'e2e-machine-001');
  const status = await licenseMod.verifyLicenseKey(key, 'e2e-machine-001', verifyOpts);

  assert.equal(isProActive(status), true);
  assert.equal(normalizeTier(status), 'personal');
});

test('[T1][F6] T1-F6-03 valid signed offline team key unlocks Team tier', async () => {
  const licenseMod = await loadCoreModule('license');
  const { key, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'team', 'e2e-machine-team-1');
  const status = await licenseMod.verifyLicenseKey(key, 'e2e-machine-team-1', verifyOpts);

  assert.equal(isProActive(status), true);
  assert.equal(normalizeTier(status), 'team');
});

test('[T1][F6] T1-F6-04 onlineVerify validates active Creem and Gumroad license payloads via local mock fetch endpoint', async () => {
  const { verifyLicenseKey } = await loadCoreModule('license');
  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v1/licenses/validate',
        status: 200,
        body: {
          valid: true,
          status: 'active',
          tier: 'personal',
          plan: 'personal',
          license_key: 'CREEM-ONLINE-VALID-001',
          instance: { id: 'e2e-machine-online' },
        },
      },
      {
        method: 'POST',
        path: '/v1/licenses/activate',
        status: 200,
        body: {
          id: 'lic_online_1',
          status: 'active',
          max_instances: 3,
          product_name: 'Personal',
        },
      },
      {
        method: 'POST',
        path: '/v2/licenses/verify',
        status: 200,
        body: {
          success: true,
          purchase: {
            id: 'gum_online_1',
            product_name: 'ReqBridge Personal',
            variants: 'Personal',
            refunded: false,
            chargebacked: false,
            disputed: false,
          },
        },
      },
    ],
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const localUrl = `${server.baseUrl}${parsed.pathname}${parsed.search}`;
    return origFetch(localUrl, init);
  };

  try {
    const status = await verifyLicenseKey('CREEM-ONLINE-VALID-001', 'e2e-machine-online', {
      onlineVerify: true,
      apiBaseUrl: server.baseUrl,
    });
    assert.equal(isProActive(status), true);
    assert.ok(server.stats().requests.length >= 1, 'onlineVerify: true must invoke fetch');

    const gumStatus = await verifyLicenseKey('GUMROAD-ONLINE-VALID-001', 'e2e-machine-online', {
      onlineVerify: true,
      provider: 'gumroad',
      apiBaseUrl: server.baseUrl,
    });
    assert.equal(isProActive(gumStatus), true);
  } finally {
    globalThis.fetch = origFetch;
    await server.close();
  }
});

test('[T1][F6] T1-F6-05 matching machineId passes offline grace validation deterministically', async () => {
  const licenseMod = await loadCoreModule('license');
  const { key, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 'machine-xyz-99');
  const s1 = await licenseMod.verifyLicenseKey(key, 'machine-xyz-99', verifyOpts);
  const s2 = await licenseMod.verifyLicenseKey(key, 'machine-xyz-99', verifyOpts);

  assert.equal(isProActive(s1), true);
  assert.equal(isProActive(s2), true);
});

test('[T1][F6] T1-F6-06 optional BYOK contract enforces user-supplied API key without hardcoded secrets', async () => {
  const { mod: byok, filePath: byokPath } = await loadCoreModuleWithPath('byok');
  assert.ok(byok && typeof byok === 'object', 'core/byok module must be loadable');

  const sourceText = fs.readFileSync(byokPath, 'utf8');
  const exportedText = Object.values(byok)
    .filter((v) => typeof v === 'function' || typeof v === 'string')
    .map((v) => String(v))
    .join('\n');
  const combinedSource = `${sourceText}\n${exportedText}`;
  assert.doesNotMatch(
    combinedSource,
    /sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}/,
    'Must not contain hardcoded AI provider or secret keys',
  );

  const translateFn = byok.translateScriptWithByok;
  assert.equal(typeof translateFn, 'function', 'core/byok must export translateScriptWithByok');

  await assert.rejects(
    async () => {
      await translateFn('pm.test("ok", () => {});', { provider: 'openai', apiKey: '', baseUrl: 'http://127.0.0.1:1' });
    },
    (err) => err instanceof Error && /key|apiKey|missing|required/i.test(err.message),
    'BYOK must reject empty user API key',
  );
});

// ============================================================================
// F7: VS Code Extension Host & .vsix Package (6 tests)
// ============================================================================

test('[T1][F7] T1-F7-01 extension/package.json satisfies publisher, name, semver, engines.vscode, main, icon, license', () => {
  const pkg = loadExtensionPackageJson();
  assert.equal(pkg.name, 'reqbridge-local-api');
  assert.equal(pkg.publisher, 'soulkey-tools');
  assert.match(String(pkg.version), /^\d+\.\d+\.\d+/);
  assert.ok(pkg.engines?.vscode, 'engines.vscode required');
  assert.equal(pkg.main, './dist/extension.js');
  assert.ok(pkg.icon, 'icon field required');
  assert.ok(pkg.license, 'license field required');
});

test('[T1][F7] T1-F7-02 extension/package.json defines valid contributes.commands and non-wildcard activationEvents', () => {
  const pkg = loadExtensionPackageJson();
  const commands = pkg.contributes?.commands;
  assert.ok(Array.isArray(commands) && commands.length >= 3, 'Expected >= 3 contributed commands');
  for (const cmd of commands) {
    assert.ok(cmd.command && typeof cmd.command === 'string');
    assert.ok(cmd.title && typeof cmd.title === 'string');
  }
  assert.ok(Array.isArray(pkg.activationEvents), 'activationEvents must be an array');
  assert.equal(pkg.activationEvents.includes('*'), false, 'Wildcard "*" activationEvent is disallowed');
});

test('[T1][F7] T1-F7-03 extension/dist/extension.js parses cleanly in vm.Script and uses only vscode + Node built-ins', () => {
  const bundlePath = getExtensionBundlePath();
  const { exports, unexpectedRequires } = loadExtensionWithMockHost({ filePath: bundlePath });

  assert.equal(unexpectedRequires.length, 0);
  assert.equal(typeof exports.activate, 'function');
});

test('[T1][F7] T1-F7-04 activate(ctx) registers all manifest commands and populates context.subscriptions', async () => {
  const pkg = loadExtensionPackageJson();
  const bundlePath = getExtensionBundlePath();
  const { exports, host } = loadExtensionWithMockHost({ filePath: bundlePath });

  await exports.activate(host.context);
  assert.ok(host.context.subscriptions.length > 0, 'activate() must push disposables to context.subscriptions');

  for (const cmd of pkg.contributes.commands) {
    assert.ok(host.registeredCommands.has(cmd.command), `Manifest command not registered on activate: ${cmd.command}`);
  }
});

test('[T1][F7] T1-F7-05 registered CodeLensProvider yields CodeLens items for .http request blocks', async () => {
  const bundlePath = getExtensionBundlePath();
  const { exports, host } = loadExtensionWithMockHost({ filePath: bundlePath });

  await exports.activate(host.context);
  assert.ok(host.codeLensProviders.length >= 1, 'Expected at least 1 CodeLensProvider registered');

  const doc = createMockTextDocument(readFixture('sample.http'), 'sample.http', 'http');
  const lenses = [];
  for (const entry of host.codeLensProviders) {
    const res = await entry.provider.provideCodeLenses(doc, { isCancellationRequested: false });
    if (Array.isArray(res)) lenses.push(...res);
  }
  assert.ok(lenses.length >= 2, `Expected >= 2 CodeLenses for 2 requests in sample.http, got ${lenses.length}`);
  assert.ok(lenses.every((l) => l.command && l.command.command));
});

test('[T1][F7] T1-F7-06 pure-Node ZIP reader verifies .vsix CRC32 and required Marketplace entries', () => {
  const { vsixPath, packageJson } = loadExtensionArtifacts();
  const zip = parseZipBuffer(fs.readFileSync(vsixPath));

  assert.ok(zip.has('[Content_Types].xml'), '[Content_Types].xml missing from .vsix');
  assert.ok(zip.has('extension.vsixmanifest'), 'extension.vsixmanifest missing from .vsix');
  assert.ok(zip.has('extension/package.json'), 'extension/package.json missing from .vsix');
  assert.ok(zip.has('extension/dist/extension.js'), 'extension/dist/extension.js missing from .vsix');
  const readmeEntry = zip.entries.find((e) => /^extension\/README\.md$/i.test(e.name));
  assert.ok(readmeEntry, 'extension/README.md (case-insensitive) missing from .vsix');

  const manifest = zip.readText('extension.vsixmanifest');
  assert.ok(manifest.includes(packageJson.publisher));
  assert.ok(manifest.includes(packageJson.version));

  const readme = zip.readText(readmeEntry.name);
  assert.ok(readme && readme.trim().length > 0, 'extension/README.md must be non-empty');
  assert.doesNotMatch(readme, /lorem ipsum|TODO:/i);

  const hasLicense = zip.entries.some((e) => /^extension\/LICENSE/i.test(e.name));
  assert.ok(hasLicense, 'extension/LICENSE missing from .vsix');

  const iconRel = String(packageJson.icon || 'media/icon.png').replace(/^\.\//, '');
  const iconBuf = zip.readBuffer(`extension/${iconRel}`);
  assert.ok(iconBuf && iconBuf.length > 8, `Icon missing from .vsix: extension/${iconRel}`);
  assert.deepEqual([...iconBuf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'Icon must be a valid PNG');
});

// ============================================================================
// F8: Real 3-Tab Web Converter, Runner & Diff (landing/demo.js) (6 tests)
// ============================================================================

test('[T1][F8] T1-F8-01 landing/demo.js initializes cleanly in node:vm DOM sandbox and renders default preset', () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);
  try {
    const out = sandbox.el('converter-output');
    const status = sandbox.el('converter-status');
    assert.ok(out && out.textContent.includes('GET'), 'Default preset must render .http output on load');
    assert.ok(status && status.textContent.length > 0);
  } finally {
    sandbox.dispose();
  }
});

test('[T1][F8] T1-F8-02 landing/demo.js converter supports Postman v2.1, Thunder Client, Bruno .bru, and .http formats', async () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);
  try {
    const outEl = sandbox.el('converter-output');
    const statusEl = sandbox.el('converter-status');

    // Thunder Client
    sandbox.setValue('postman-input', readFixture('thunder-client.json'));
    await sandbox.flush(320);
    assert.equal(statusEl.className, 'status-ok', `Thunder Client parse failed: ${statusEl.textContent}`);
    assert.ok(outEl.textContent.includes('/v2/orders'));

    // Bruno .bru
    sandbox.setValue('postman-input', readFixture('bruno-single.bru'));
    await sandbox.flush(320);
    assert.equal(statusEl.className, 'status-ok', `Bruno .bru parse failed: ${statusEl.textContent}`);
    assert.ok(outEl.textContent.includes('/refund'));

    // .http
    sandbox.setValue('postman-input', readFixture('sample.http'));
    await sandbox.flush(320);
    assert.equal(statusEl.className, 'status-ok', `.http parse failed: ${statusEl.textContent}`);
    assert.ok(outEl.textContent.includes('POST'));

    // Switch to OpenAPI 3.1 YAML output
    sandbox.click('.format-btn[data-format="openapi"]');
    assert.ok(outEl.textContent.includes('openapi: 3.1.0') || outEl.textContent.includes('openapi: "3.1.0"'));
  } finally {
    sandbox.dispose();
  }
});

test('[T1][F8] T1-F8-03 landing/demo.js runner parses real CSV rows and executes real fetch() calls to 127.0.0.1', async () => {
  const { landingDir } = loadLandingFiles();
  const server = await createMockHttpServer({
    routes: [
      { method: 'POST', path: '/v2/orders', status: 201, body: { created: true } },
      { method: 'GET', path: '/v2/orders', status: 200, body: { items: [] } },
    ],
  });
  const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });

  try {
    // Locate CSV input & URL input in runner panel
    const csvEl = sandbox.el('#csv-input') || sandbox.el('#batch-csv-input') || sandbox.el('[data-panel="runner"] textarea');
    assert.ok(csvEl, 'Tab 2 must provide an editable CSV input textarea');
    const targetUrlEl = findRunnerUrlInput(sandbox);
    if (targetUrlEl) {
      sandbox.setValue(targetUrlEl, `${server.baseUrl}/v2/orders`);
    }

    const csvRows = 'orderId,customer\nord_1,Alice\nord_2,Bob\nord_3,Carol\n';
    sandbox.setValue(csvEl, csvRows);

    // Ensure Postman/request URL uses our 127.0.0.1 server if runner draws from Tab 1 or template
    const tplEl = sandbox.el('#batch-request-input') || sandbox.el('#runner-request-input');
    if (tplEl) {
      sandbox.setValue(tplEl, `POST ${server.baseUrl}/v2/orders\nContent-Type: application/json\n\n{"orderId":"{{orderId}}"}`);
    }

    sandbox.click('#run-batch-btn');
    await sandbox.flush(320);

    assert.ok(sandbox.getFetchCalls().length >= 3, `Expected >= 3 real fetch() calls, got ${sandbox.getFetchCalls().length}`);
    assert.ok(server.stats().requests.length >= 3, 'Mock 127.0.0.1 server must receive real HTTP requests from Tab 2');
  } finally {
    sandbox.dispose();
    await server.close();
  }
});

test('[T1][F8] T1-F8-04 landing/demo.js runner exports real JUnit XML and Markdown reports matching executed rows', async () => {
  const { landingDir } = loadLandingFiles();
  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } }],
  });
  const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });

  try {
    const csvEl = sandbox.el('#csv-input') || sandbox.el('#batch-csv-input') || sandbox.el('[data-panel="runner"] textarea');
    assert.ok(csvEl, 'Tab 2 must provide an editable CSV input');
    sandbox.setValue(csvEl, 'orderId,customer\nord_1,Alice\nord_2,Bob\n');
    const urlEl = findRunnerUrlInput(sandbox);
    if (urlEl) sandbox.setValue(urlEl, `${server.baseUrl}/v2/orders`);

    sandbox.click('#run-batch-btn');
    await sandbox.flush(320);

    const junitBtn = sandbox.el('#export-junit-btn') || sandbox.el('[data-export="junit"]');
    const mdBtn = sandbox.el('#export-md-btn') || sandbox.el('[data-export="markdown"]');
    assert.ok(junitBtn || mdBtn, 'Tab 2 must expose JUnit XML and/or Markdown export controls');

    if (junitBtn) junitBtn.click();
    if (mdBtn) mdBtn.click();

    const blobs = sandbox.getBlobs().map((b) => b.text).join('\n');
    const logText = sandbox.el('#batch-log')?.textContent || '';
    const combined = `${blobs}\n${logText}`;
    assert.ok(combined.includes('<testsuite') || combined.includes('<testcase'), 'Expected exported JUnit XML content');
  } finally {
    sandbox.dispose();
    await server.close();
  }
});

test('[T1][F8] T1-F8-05 landing/demo.js diff computes live structural JSON diff from user-editable inputs', async () => {
  const { landingDir } = loadLandingFiles();
  const sandbox = createLandingSandbox(landingDir);

  try {
    const stgInput = sandbox.el('#diff-staging-input') || sandbox.el('#diff-staging');
    const prodInput = sandbox.el('#diff-prod-input') || sandbox.el('#diff-prod');
    const banner = sandbox.el('#diff-banner');

    assert.ok(stgInput && prodInput && banner);
    assert.ok(
      stgInput.tagName === 'TEXTAREA' || sandbox.el('#diff-staging-input'),
      'Tab 3 must provide editable staging/prod JSON inputs for live structural diff',
    );

    const customStg = JSON.stringify({ unique_e2e_field: 42, shifted: 'now_string' });
    const customProd = JSON.stringify({ unique_e2e_field: 42, shifted: 99, removed_prod_key: true });

    sandbox.setValue(stgInput, customStg);
    sandbox.setValue(prodInput, customProd);
    const runDiffBtn = sandbox.el('#run-diff-btn');
    if (runDiffBtn) runDiffBtn.click();
    await sandbox.flush(320);

    const diffSummary = `${banner.textContent}\n${sandbox.el('#diff-result')?.textContent || ''}`;
    assert.ok(diffSummary.includes('shifted') && diffSummary.includes('removed_prod_key'), 'Diff UI must detect custom field drift dynamically');
  } finally {
    sandbox.dispose();
  }
});

test('[T1][F8] T1-F8-06 landing/demo.js contains zero setInterval batch loops and zero Node-only imports', () => {
  const { files } = loadLandingFiles();
  const code = files['demo.js'].readText();

  assert.doesNotMatch(code, /\bsetInterval\s*\(/, 'Fake setInterval batch loop must be removed from landing/demo.js');
  assert.doesNotMatch(code, /\brequire\(['"]node:|import\s+.*['"]node:/, 'landing/demo.js must not use Node-only imports');
});

// ============================================================================
// F9: Web Conversion, SEO, Assets & Checkout Readiness (6 tests)
// ============================================================================

test('[T1][F9] T1-F9-01 all 11 required landing/ static files exist and are non-empty', () => {
  const { files } = loadLandingFiles();
  for (const name of REQUIRED_LANDING_FILES) {
    assert.equal(files[name].exists, true, `Missing required landing file: ${name}`);
    assert.ok(files[name].readText().trim().length > 0, `Empty landing file: ${name}`);
  }
});

test('[T1][F9] T1-F9-02 landing/index.html includes canonical, icon, OpenGraph, and Twitter SEO meta tags', () => {
  const { files } = loadLandingFiles();
  const html = files['index.html'].readText();

  assert.match(html, /<title>[^<]+<\/title>/i);
  assert.match(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i);
  assert.match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/reqbridge-local-api\.pages\.dev\/["']/i);
  assert.match(html, /<link[^>]+rel=["']icon["'][^>]+href=["']favicon\.svg["']/i);
  assert.match(html, /property=["']og:title["']/i);
  assert.match(html, /property=["']og:description["']/i);
  assert.match(html, /property=["']og:type["']/i);
  assert.match(html, /property=["']og:url["']/i);
  assert.match(html, /name=["']twitter:card["']/i);
});

test('[T1][F9] T1-F9-03 robots.txt and sitemap.xml are well-formed and reference public HTML pages', () => {
  const { files } = loadLandingFiles();
  assert.equal(files['robots.txt'].exists, true, 'landing/robots.txt missing');
  assert.equal(files['sitemap.xml'].exists, true, 'landing/sitemap.xml missing');

  const robots = files['robots.txt'].readText();
  const sitemap = files['sitemap.xml'].readText();

  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Sitemap:\s*https:\/\/reqbridge-local-api\.pages\.dev\/sitemap\.xml/i);

  assert.match(sitemap, /<urlset[^>]+>/i);
  for (const page of ['index.html', 'checkout-personal.html', 'checkout-team.html', 'privacy.html', 'terms.html', 'refund.html']) {
    const locOk = sitemap.includes(`/${page}`) || (page === 'index.html' && sitemap.includes('https://reqbridge-local-api.pages.dev/</loc>'));
    assert.ok(locOk, `sitemap.xml missing URL for ${page}`);
  }
});

test('[T1][F9] T1-F9-04 favicon.svg is valid SVG and landing/ uses zero external CDN or font links', () => {
  const { files } = loadLandingFiles();
  assert.equal(files['favicon.svg'].exists, true, 'landing/favicon.svg missing');
  const svg = files['favicon.svg'].readText().trim();
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));

  const htmlAndCss = ['index.html', 'styles.css', 'checkout-personal.html', 'checkout-team.html', 'privacy.html', 'terms.html', 'refund.html'];
  for (const name of htmlAndCss) {
    const content = files[name].readText();
    assert.doesNotMatch(
      content,
      /(https?:)?\/\/(cdn\.|unpkg\.com|jsdelivr\.net|cdnjs\.|fonts\.googleapis\.com|fonts\.gstatic\.com)/i,
      `External CDN/font URL detected in ${name}`,
    );
  }
});

test('[T1][F9] T1-F9-05 pricing ($19 Personal / $29 Team) and support email are consistent across all HTML pages', () => {
  const { files } = loadLandingFiles();
  const pages = ['index.html', 'checkout-personal.html', 'checkout-team.html', 'terms.html', 'refund.html'];
  for (const page of pages) {
    const text = files[page].readText();
    assert.ok(text.includes('soulkey529@gmail.com'), `Support email missing in ${page}`);
  }
  assert.ok(files['index.html'].readText().includes('$19') && files['index.html'].readText().includes('$29'));
  assert.ok(files['checkout-personal.html'].readText().includes('$19'));
  assert.ok(files['checkout-team.html'].readText().includes('$29'));
  assert.ok(files['terms.html'].readText().includes('$19') && files['terms.html'].readText().includes('$29'));
  assert.ok(files['refund.html'].readText().includes('$19') && files['refund.html'].readText().includes('$29'));
});

test('[T1][F9] T1-F9-06 .vsix / Marketplace CTAs present and 100% of internal relative links resolve cleanly', () => {
  const { landingDir, files } = loadLandingFiles();
  const indexHtml = files['index.html'].readText();

  assert.ok(
    indexHtml.includes('soulkey-tools.reqbridge-local-api') || /\.vsix/i.test(indexHtml),
    'index.html must include VS Code Marketplace ID (soulkey-tools.reqbridge-local-api) or .vsix download CTA',
  );

  const htmlPages = ['index.html', 'checkout-personal.html', 'checkout-team.html', 'privacy.html', 'terms.html', 'refund.html'];
  for (const page of htmlPages) {
    const html = files[page].readText();
    const refs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|tel:|data:|#)/i.test(ref)) continue;
      const [filePart] = ref.split('#');
      if (!filePart) continue;
      const resolved = path.resolve(landingDir, filePart);
      assert.equal(fs.existsSync(resolved), true, `Broken relative asset/link "${ref}" in ${page}`);
    }
  }
});
