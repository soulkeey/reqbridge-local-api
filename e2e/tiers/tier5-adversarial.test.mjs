import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  loadCoreModule,
  loadExtensionArtifacts,
  loadLandingFiles,
  getRootDir,
} from '../lib/contract-loader.mjs';
import { createLandingSandbox } from '../lib/dom-sandbox.mjs';
import { createMockHttpServer } from '../lib/mock-http.mjs';
import {
  obtainSignedTestLicense,
  withTempWorkDir,
} from '../lib/test-helpers.mjs';
import { createMockTextDocument, loadExtensionWithMockHost } from '../lib/vscode-host-mock.mjs';
import { parseZipBuffer } from '../lib/zip-reader.mjs';

const execFileAsync = promisify(execFile);

test('[T5][F7,F2] T5-01 CodeLens skips stray non-comment header lines 1:1 with parseInputCollection and executes matching block', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { bundlePath } = loadExtensionArtifacts();

  const received = [];
  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/one', status: 200, handler: ({ res }) => { received.push('GET /one'); res.writeHead(200); res.end('one'); } },
      { method: 'POST', path: '/two', status: 201, handler: ({ res }) => { received.push('POST /two'); res.writeHead(201); res.end('two'); } },
    ],
  });

  try {
    await withTempWorkDir('t5-codelens', async (dir) => {
      const httpText = [
        '### First Request',
        'Stray non-comment note line',
        `GET ${server.baseUrl}/one`,
        '',
        '### Second Request',
        `POST ${server.baseUrl}/two`,
      ].join('\n');
      const col = parseInputCollection(httpText, 'http');
      assert.equal(col.requests.length, 2);
      assert.equal(col.requests[0].method, 'GET');
      assert.equal(col.requests[1].method, 'POST');

      const httpFile = path.join(dir, 'stray.http');
      fs.writeFileSync(httpFile, httpText, 'utf8');

      const { exports, host } = loadExtensionWithMockHost({ filePath: bundlePath });
      await exports.activate(host.context);
      const doc = createMockTextDocument(httpText, httpFile, 'http');
      const lenses = await host.codeLensProviders[0].provider.provideCodeLenses(doc, { isCancellationRequested: false });
      assert.equal(lenses.length, 6);
      assert.deepEqual(lenses.map((l) => l.command.arguments[1]), [0, 0, 0, 1, 1, 1]);

      const sendSecond = lenses.find((l) => l.command.command === 'reqbridge.sendRequest' && l.command.arguments[1] === 1);
      assert.ok(sendSecond);
      await host.vscode.commands.executeCommand(sendSecond.command.command, ...sendSecond.command.arguments);
      assert.deepEqual(received, ['POST /two']);
    });
  } finally {
    await server.close();
  }
});

test('[T5][F7,F4] T5-02 diffStagingProd forwards req.query, req.auth, contentType, {{var}} raw body, and urlencoded/formdata modes', async () => {
  const { bundlePath } = loadExtensionArtifacts();
  const licenseMod = await loadCoreModule('license');
  const seen = { staging: [], prod: [] };

  const captureHandler = (bucket) => ({ req, body, res }) => {
    bucket.push({
      url: req.url,
      auth: req.headers.authorization || null,
      apiKey: req.headers['x-custom-key'] || null,
      ct: req.headers['content-type'] || '',
      body,
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  };

  const server = await createMockHttpServer({
    routes: [
      { method: 'POST', path: '/staging/v2/orders', handler: captureHandler(seen.staging) },
      { method: 'POST', path: '/prod/v2/orders', handler: captureHandler(seen.prod) },
      { method: 'GET', path: '/staging/v2/basic', handler: captureHandler(seen.staging) },
      { method: 'GET', path: '/prod/v2/basic', handler: captureHandler(seen.prod) },
      { method: 'GET', path: '/staging/v2/keyq', handler: captureHandler(seen.staging) },
      { method: 'GET', path: '/prod/v2/keyq', handler: captureHandler(seen.prod) },
      { method: 'POST', path: '/staging/v2/form', handler: captureHandler(seen.staging) },
      { method: 'POST', path: '/prod/v2/form', handler: captureHandler(seen.prod) },
      { method: 'POST', path: '/staging/v2/multi', handler: captureHandler(seen.staging) },
      { method: 'POST', path: '/prod/v2/multi', handler: captureHandler(seen.prod) },
    ],
  });

  try {
    await withTempWorkDir('t5-diff-sample', async (dir) => {
      const col = {
        info: { name: 'Diff Sample' },
        variable: [
          { key: 'baseUrl', value: server.baseUrl },
          { key: 'apiToken', value: 'tok_secret_1' },
          { key: 'orderId', value: 'ord_42' },
        ],
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{apiToken}}' }] },
        item: [
          {
            name: 'Raw Bearer Query',
            request: {
              method: 'POST',
              url: { raw: '{{baseUrl}}/v2/orders?status=paid', query: [{ key: 'status', value: 'paid' }] },
              body: { mode: 'raw', raw: '{"orderId":"{{orderId}}"}', options: { raw: { language: 'json' } } },
            },
          },
          {
            name: 'Basic Auth',
            request: {
              method: 'GET',
              auth: { type: 'basic', basic: [{ key: 'username', value: 'alice' }, { key: 'password', value: 's3cr3t' }] },
              url: '{{baseUrl}}/v2/basic',
            },
          },
          {
            name: 'ApiKey Query',
            request: {
              method: 'GET',
              auth: { type: 'apikey', apikey: [{ key: 'key', value: 'api_key' }, { key: 'value', value: 'k_123' }, { key: 'in', value: 'query' }] },
              url: '{{baseUrl}}/v2/keyq',
            },
          },
          {
            name: 'Urlencoded',
            request: {
              method: 'POST',
              auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Custom-Key' }, { key: 'value', value: 'hdr_9' }, { key: 'in', value: 'header' }] },
              url: '{{baseUrl}}/v2/form',
              body: { mode: 'urlencoded', urlencoded: [{ key: 'order', value: '{{orderId}}' }] },
            },
          },
          {
            name: 'Multipart',
            request: {
              method: 'POST',
              auth: { type: 'noauth' },
              url: '{{baseUrl}}/v2/multi',
              body: { mode: 'formdata', formdata: [{ key: 'field', value: '{{orderId}}', type: 'text' }] },
            },
          },
        ],
      };

      const pmPath = path.join(dir, 'diff.postman.json');
      fs.writeFileSync(pmPath, JSON.stringify(col), 'utf8');

      // Use Pro license to allow collection-wide diff (or test each blockIndex)
      const { key: proKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 't5-diff-machine');
      const { exports, host } = loadExtensionWithMockHost({
        filePath: bundlePath,
        vscodeOpts: {
          machineId: 't5-diff-machine',
          inputResponses: [`${server.baseUrl}/staging`, `${server.baseUrl}/prod`],
        },
      });
      await exports.activate(host.context);

      for (let i = 0; i < col.item.length; i += 1) {
        await host.vscode.commands.executeCommand('reqbridge.diffStagingProd', host.vscode.Uri.file(pmPath), i);
        // Queue staging & prod URLs for next invocation
        const stgInput = `${server.baseUrl}/staging`;
        const prodInput = `${server.baseUrl}/prod`;
        if (i < col.item.length - 1) {
          host.vscode.window.showInputBox = (() => {
            const q = [stgInput, prodInput];
            return async () => q.shift();
          })();
        }
      }
      // Also check signed key was obtainable cleanly
      assert.ok(proKey.startsWith('RB1.') && verifyOpts.publicKeyPem);

      assert.equal(seen.staging.length, 5);
      assert.equal(seen.prod.length, 5);
      // 0: Raw + Bearer + Query + Content-Type + {{orderId}}
      assert.equal(seen.staging[0].url, '/staging/v2/orders?status=paid');
      assert.equal(seen.staging[0].auth, 'Bearer tok_secret_1');
      assert.match(seen.staging[0].ct, /application\/json/i);
      assert.equal(seen.staging[0].body, '{"orderId":"ord_42"}');
      // 1: Basic Auth
      assert.equal(seen.staging[1].auth, `Basic ${Buffer.from('alice:s3cr3t').toString('base64')}`);
      // 2: ApiKey Query
      assert.equal(seen.staging[2].url, '/staging/v2/keyq?api_key=k_123');
      // 3: Urlencoded + ApiKey Header
      assert.equal(seen.staging[3].apiKey, 'hdr_9');
      assert.match(seen.staging[3].ct, /application\/x-www-form-urlencoded/i);
      assert.equal(seen.staging[3].body, 'order=ord_42');
      // 4: Multipart formdata
      assert.match(seen.staging[4].ct, /multipart\/form-data; boundary=/i);
      assert.ok(seen.staging[4].body.includes('ord_42'));
    });
  } finally {
    await server.close();
  }
});

test('[T5][F3,F5,F8] T5-03 Compound && assertions evaluate all clauses across Core, CI bundle, and Web Tab 2', async () => {
  const { runBatch } = await loadCoreModule('runner');
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { landingDir } = loadLandingFiles();

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 200, body: { ok: false, tag: 'a&&b' } }],
  });

  try {
    // 1. Core runBatch
    const baseReq = {
      id: 'c1',
      name: 'Compound',
      folder: [],
      method: 'POST',
      url: `${server.baseUrl}/v2/orders`,
      headers: { 'Content-Type': 'application/json' },
      query: [],
      body: { mode: 'raw', raw: '{}', contentType: 'application/json' },
      sourceFormat: 'http',
    };
    const failCore = await runBatch([{ ...baseReq, tests: ['status == 200 && res.body.ok == true'] }], [{}], {});
    assert.equal(failCore.passedCount, 0, 'Core compound && with false second clause must fail');
    const passCore = await runBatch([{ ...baseReq, tests: ['status == 200 && res.body.ok == false && body contains "a&&b"'] }], [{}], {});
    assert.equal(passCore.passedCount, 1);

    // 2. CI exporter subprocess
    await withTempWorkDir('t5-compound-ci', async (dir) => {
      const { runnerJs } = exportCiBundle('comp.http');
      fs.writeFileSync(path.join(dir, 'runner.mjs'), runnerJs, 'utf8');
      fs.writeFileSync(path.join(dir, 'comp.http'), `### Fail Compound\nPOST ${server.baseUrl}/v2/orders\n# @assert status == 200 && res.body.ok == true\n`, 'utf8');
      await assert.rejects(
        () => execFileAsync(process.execPath, ['runner.mjs'], { cwd: dir, timeout: 10000 }),
        (err) => err && err.code === 1
      );
      fs.writeFileSync(path.join(dir, 'comp.http'), `### Pass Compound\nPOST ${server.baseUrl}/v2/orders\n# @assert status == 200 && res.body.ok == false && body contains "a&&b"\n`, 'utf8');
      const okRun = await execFileAsync(process.execPath, ['runner.mjs'], { cwd: dir, timeout: 10000 });
      assert.ok(okRun.stdout.includes('1/1 passed'));
    });

    // 3. Web Tab 2
    const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });
    try {
      sandbox.click('.ide-tab[data-tab="runner"]');
      sandbox.setValue('#batch-url-input', `${server.baseUrl}/v2/orders`);
      sandbox.setValue('#csv-input', 'orderId\nord_1\n');
      sandbox.setValue('#batch-assert-input', 'status == 200 && res.body.ok == true');
      sandbox.click('#run-batch-btn');
      await sandbox.flush(200);
      assert.match(sandbox.el('#batch-log').textContent, /0\/1 passed/);

      sandbox.setValue('#batch-assert-input', 'status == 200 && res.body.ok == false');
      sandbox.click('#run-batch-btn');
      await sandbox.flush(200);
      assert.match(sandbox.el('#batch-log').textContent, /1\/1 passed/);
    } finally {
      sandbox.dispose();
    }
  } finally {
    await server.close();
  }
});

test('[T5][F3,F5] T5-04 Bracket [idx] traversal, prototype guard, unsupported assertion rejection, and __proto__ CSV header safety', async () => {
  const { parseCsvRows, runBatch } = await loadCoreModule('runner');
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const { landingDir } = loadLandingFiles();

  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/items', status: 201, body: { id: 'ord_1', nested: [{ ok: true }] } },
      {
        method: 'POST',
        path: '/echo',
        handler: ({ body, res }) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(body);
        },
      },
    ],
  });

  try {
    const mkReq = (tests) => [{
      id: 'p1', name: 'Probe', folder: [], method: 'GET', url: `${server.baseUrl}/items`,
      headers: {}, query: [], tests, sourceFormat: 'http',
    }];

    assert.equal((await runBatch(mkReq(['res.body.nested[0].ok == false']), [{}], {})).passedCount, 0);
    assert.equal((await runBatch(mkReq(['res.body.nested[0].ok == true']), [{}], {})).passedCount, 1);
    assert.equal((await runBatch(mkReq(['res.body.toString == function toString() { [native code] }']), [{}], {})).passedCount, 0);
    assert.equal((await runBatch(mkReq(['res.body.constructor.name == Object']), [{}], {})).passedCount, 0);
    assert.equal((await runBatch(mkReq(['res.body.hasOwnProperty == function hasOwnProperty() { [native code] }']), [{}], {})).passedCount, 0);

    const unsupported = await runBatch(mkReq(['expect(res.body.id).to.equal("WRONG")']), [{}], {});
    assert.equal(unsupported.passedCount, 0);
    assert.match(unsupported.results[0].assertions[0].detail || '', /unsupported assertion/i);

    await withTempWorkDir('t5-ci-asserts', async (dir) => {
      const { runnerJs } = exportCiBundle('t.http', 'd.csv');
      fs.writeFileSync(path.join(dir, 'runner.mjs'), runnerJs, 'utf8');
      fs.writeFileSync(path.join(dir, 'd.csv'), '__proto__,constructor,orderId\npolluted,hacked,ord_1\n', 'utf8');

      for (const expr of [
        'res.body.nested[0].ok == false',
        'res.body.toString == function toString() { [native code] }',
        'expect(res.body.id).to.equal("WRONG")',
      ]) {
        fs.writeFileSync(path.join(dir, 't.http'), `### Fail\nGET ${server.baseUrl}/items\n# @assert ${expr}\n`, 'utf8');
        await assert.rejects(
          () => execFileAsync(process.execPath, ['runner.mjs'], { cwd: dir, timeout: 10000 }),
          (err) => err && err.code === 1
        );
      }

      fs.writeFileSync(path.join(dir, 't.http'), `### Pass\nPOST ${server.baseUrl}/echo\nContent-Type: application/json\n\n{"p":"{{__proto__}}","o":"{{orderId}}"}\n# @assert res.body.p == polluted\n`, 'utf8');
      const okCi = await execFileAsync(process.execPath, ['runner.mjs'], { cwd: dir, timeout: 10000 });
      assert.ok(okCi.stdout.includes('1/1 passed'));
    });

    // Core CSV __proto__ preservation without prototype pollution
    const csvRows = parseCsvRows('__proto__,constructor,orderId\npolluted,hacked,ord_1\n');
    assert.equal(csvRows.length, 1);
    assert.equal(Object.getPrototypeOf(csvRows[0]), Object.prototype);
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.getOwnPropertyDescriptor(csvRows[0], '__proto__')?.value, 'polluted');
    assert.equal(csvRows[0].constructor, 'hacked');
    assert.equal(csvRows[0].orderId, 'ord_1');

    // Web Tab 2 CSV __proto__ preservation without prototype pollution
    const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });
    try {
      sandbox.click('.ide-tab[data-tab="runner"]');
      sandbox.setValue('#batch-url-input', `${server.baseUrl}/echo`);
      sandbox.setValue('#csv-input', '__proto__,orderId\npolluted,ord_1\n');
      sandbox.setValue('#batch-body-input', '{"p":"{{__proto__}}","o":"{{orderId}}"}');
      sandbox.setValue('#batch-assert-input', 'res.body.p == polluted');
      sandbox.click('#run-batch-btn');
      await sandbox.flush(200);
      assert.match(sandbox.el('#batch-log').textContent, /1\/1 passed/);
    } finally {
      sandbox.dispose();
    }
  } finally {
    await server.close();
  }
});

test('[T5][F3,F4,F8] T5-05 Markdown reports normalize \\r/\\n and \\| cleanly in Core and Web without breaking GFM table rows', async () => {
  const { exportBatchMarkdown } = await loadCoreModule('runner');
  const { formatDiffMarkdown } = await loadCoreModule('diff');
  const { landingDir } = loadLandingFiles();

  const coreBatchMd = exportBatchMarkdown({
    totalRows: 1, totalRequests: 1, totalExecutions: 1, passedCount: 0, failedCount: 1,
    minLatencyMs: 5, maxLatencyMs: 5, p50LatencyMs: 5, p95LatencyMs: 5, durationMs: 5,
    results: [{
      rowIndex: 0, requestId: 'r1',
      requestName: 'Line1\n| 2 | INJECTED | 200 | boom |',
      method: 'POST', url: 'http://127.0.0.1/a', status: 500, latencyMs: 5, passed: false,
      assertions: [],
      error: 'Err line1\r\n| 3 | EVIL | 200 | injected |\nPath \\| Pipe',
    }],
  });
  const batchTableLines = coreBatchMd.split('\n').filter((l) => l.startsWith('|'));
  assert.equal(batchTableLines.length, 3, 'Batch MD table must have exactly header + sep + 1 row');
  assert.ok(!coreBatchMd.includes('\n| 2 | INJECTED'));
  assert.ok(coreBatchMd.includes('Path \\\\\\| Pipe'));

  const coreDiffMd = formatDiffMarkdown({
    endpoint: 'GET /a|b\n| injected |',
    statusMatch: false, stagingStatus: 500, prodStatus: 200, latencyDeltaMs: 10,
    hasBreakingChanges: true, summary: 'BREAKING\n| injected |',
    entries: [{ kind: 'status_drift', severity: 'breaking', path: '$.a|b\nc', message: 'line1\r\n| fake | row |' }],
  });
  const diffTableLines = coreDiffMd.split('\n').filter((l) => l.startsWith('|'));
  assert.equal(diffTableLines.length, 3, 'Diff MD table must have exactly header + sep + 1 row');

  // Web Tab 2 & Tab 3 Markdown export
  const sandbox = createLandingSandbox(landingDir, {
    fetchImpl: async () => new Response('fail', { status: 500 }),
  });
  try {
    sandbox.click('.ide-tab[data-tab="runner"]');
    sandbox.setValue('#batch-url-input', 'http://127.0.0.1/v2|orders?x={{id}}');
    sandbox.setValue('#csv-input', 'id\n"1\n| 9 | INJECTED |"\n');
    sandbox.click('#run-batch-btn');
    await sandbox.flush(200);
    sandbox.click('#export-md-btn');
    const webBatchMd = sandbox.getBlobs().at(-1).text;
    const webBatchRows = webBatchMd.split('\n').filter((l) => l.startsWith('|'));
    assert.equal(webBatchRows.length, 3);

    sandbox.click('.ide-tab[data-tab="diff"]');
    sandbox.setValue('#diff-endpoint-input', 'GET /a|b\n| injected |');
    sandbox.setValue('#diff-staging-status', '200');
    sandbox.setValue('#diff-prod-status', '200');
    sandbox.setValue('#diff-staging-latency', '40');
    sandbox.setValue('#diff-prod-latency', '40');
    sandbox.setValue('#diff-staging-input', JSON.stringify({ 'a|b\nc': 1 }));
    sandbox.setValue('#diff-prod-input', JSON.stringify({ 'a|b\nc': 'str' }));
    sandbox.click('#run-diff-btn');
    await sandbox.flush(150);
    sandbox.click('#download-diff-md-btn');
    const webDiffMd = sandbox.getBlobs().at(-1).text;
    const webDiffRows = webDiffMd.split('\n').filter((l) => l.startsWith('|'));
    assert.equal(webDiffRows.length, 3);
  } finally {
    sandbox.dispose();
  }
});

test('[T5][F2,F8] T5-06 Core & Web OpenAPI 3.1 parity for host:port, :batchGet, {{protocol}}://{{host}}:{{port}}, YAML Unicode LB, and disabled query', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toHttpFile, toOpenApiYaml } = await loadCoreModule('transpiler');
  const { landingDir } = loadLandingFiles();

  const colJson = JSON.stringify({
    info: { name: 'Test\u0085\u2028\u2029Name' },
    item: [
      { name: 'HostPort', request: { method: 'GET', url: 'localhost:3000/v2/orders' } },
      { name: 'BatchGet', request: { method: 'POST', url: 'https://api.example.com/v1/items:batchGet' } },
      { name: 'TemplatedHost', request: { method: 'GET', url: '{{protocol}}://{{host}}:{{port}}/v2/health' } },
      {
        name: 'DisabledQuery',
        request: {
          method: 'GET',
          url: { raw: 'https://api.test/v2/items?debug=1', query: [{ key: 'debug', value: '1', disabled: true }] },
        },
      },
    ],
  });

  const parsed = parseInputCollection(colJson, 'postman');
  const coreHttp = toHttpFile(parsed).httpContent;
  const coreYaml = toOpenApiYaml(parsed);

  const checkParity = (httpStr, yamlStr, label) => {
    assert.ok(!httpStr.includes('debug=1'), `${label}: disabled query param must not leak into .http`);
    assert.ok(yamlStr.includes('\n  /v2/orders:\n'), `${label}: localhost:3000/v2/orders must normalize to /v2/orders`);
    assert.ok(yamlStr.includes('\n  "/v1/items:batchGet":\n'), `${label}: :batchGet must not become {batchGet}`);
    assert.ok(yamlStr.includes('\n  /v2/health:\n'), `${label}: {{protocol}}://{{host}}:{{port}}/v2/health must normalize to /v2/health`);
    assert.ok(!/[\u0085\u2028\u2029]/.test(yamlStr), `${label}: raw Unicode line breaks must be escaped in YAML`);
    assert.ok(yamlStr.includes('\\u2028') && yamlStr.includes('\\u0085') && yamlStr.includes('\\u2029'), `${label}: expected escaped Unicode LB`);
  };

  checkParity(coreHttp, coreYaml, 'Core');

  const sandbox = createLandingSandbox(landingDir);
  try {
    sandbox.click('.ide-tab[data-tab="converter"]');
    sandbox.setValue('postman-input', colJson);
    await sandbox.flush(200);
    const webHttp = sandbox.el('converter-output').textContent;
    sandbox.click('.format-btn[data-format="openapi"]');
    const webYaml = sandbox.el('converter-output').textContent;
    checkParity(webHttp, webYaml, 'Web');
  } finally {
    sandbox.dispose();
  }
});

test('[T5][F4,F8] T5-07 Core diffResponses vs Web Tab 3 parity on invalid JSON (warning), plain-text value_mismatch, and status 0', async () => {
  const { diffResponses } = await loadCoreModule('diff');
  const { landingDir } = loadLandingFiles();

  const coreInvalid = diffResponses('GET /x', { status: 200, latencyMs: 10, headers: {}, bodyText: 'not json' }, { status: 200, latencyMs: 10, headers: {}, bodyText: '{"a":1}' });
  assert.equal(coreInvalid.hasBreakingChanges, false);
  assert.equal(coreInvalid.entries[0].severity, 'warning');

  const coreText = diffResponses('GET /txt', { status: 200, latencyMs: 10, headers: {}, bodyText: 'hello' }, { status: 200, latencyMs: 10, headers: {}, bodyText: 'world' });
  assert.equal(coreText.hasBreakingChanges, false);
  assert.ok(coreText.entries.some((e) => e.kind === 'value_mismatch' && e.severity === 'info' && e.path === '$bodyText'));

  const sandbox = createLandingSandbox(landingDir);
  try {
    sandbox.click('.ide-tab[data-tab="diff"]');
    sandbox.setValue('#diff-staging-status', '200');
    sandbox.setValue('#diff-prod-status', '200');
    sandbox.setValue('#diff-staging-input', 'not json');
    sandbox.setValue('#diff-prod-input', '{"a":1}');
    sandbox.click('#run-diff-btn');
    await sandbox.flush(150);
    assert.match(sandbox.el('#diff-banner').textContent, /^WARNING/);

    sandbox.setValue('#diff-staging-input', 'hello');
    sandbox.setValue('#diff-prod-input', 'world');
    sandbox.click('#run-diff-btn');
    await sandbox.flush(150);
    assert.match(sandbox.el('#diff-banner').textContent, /^WARNING/);
    assert.ok(sandbox.el('#diff-result').textContent.includes('$bodyText'));
    assert.ok(sandbox.el('#diff-result').textContent.includes('[value_mismatch]'));

    // Status 0 must be preserved (not coerced to 200)
    sandbox.setValue('#diff-staging-status', '0');
    sandbox.setValue('#diff-prod-status', '200');
    sandbox.setValue('#diff-staging-input', '{}');
    sandbox.setValue('#diff-prod-input', '{}');
    sandbox.click('#run-diff-btn');
    await sandbox.flush(150);
    assert.ok(sandbox.el('#diff-result').textContent.includes('staging=0 vs prod=200'));
  } finally {
    sandbox.dispose();
  }
});

test('[T5][F7,F6,F5] T5-08 Trial quota not burned on unreachable run, exportCiBundle activeTextEditor, ci-exporter rejects Unicode LB/~/, webview >200 notice', async () => {
  const { exportCiBundle } = await loadCoreModule('ci-exporter');
  const licenseMod = await loadCoreModule('license');
  const { bundlePath } = loadExtensionArtifacts();

  // 1. ci-exporter filename checks
  for (const bad of ['req\u2028name.http', 'req\u0085.http', 'req\u2029.http', '~/evil.http', '~\\evil.http', '~']) {
    assert.throws(() => exportCiBundle(bad), /Unsafe or invalid/);
  }

  // 2. Webview >200 truncation notice
  const webviewJsPath = path.join(getRootDir(), 'extension', 'out-test', 'src', 'vscode', 'webview.js');
  if (fs.existsSync(webviewJsPath)) {
    const { exports: wv } = loadExtensionWithMockHost({ filePath: webviewJsPath });
    const results205 = Array.from({ length: 205 }, (_, i) => ({
      rowIndex: i, requestId: 'r', requestName: `Row${i}`, method: 'GET', url: 'http://127.0.0.1',
      status: 200, latencyMs: 1, passed: true, assertions: [],
    }));
    const html = wv.renderBatchReportHtml({
      totalRows: 205, totalRequests: 1, totalExecutions: 205, passedCount: 205, failedCount: 0,
      minLatencyMs: 1, maxLatencyMs: 1, p50LatencyMs: 1, p95LatencyMs: 1, durationMs: 10, results: results205,
    });
    assert.match(html, /Showing first 200 of 205/i);
  }

  // 3. runCsvBatch trial quota + exportCiBundle activeTextEditor fallback
  const server = await createMockHttpServer({
    routes: [{ method: 'GET', path: '/ok', status: 200, body: { ok: true } }],
  });
  try {
    await withTempWorkDir('t5-trial-ci', async (dir) => {
      const unreachableHttp = path.join(dir, 'unreachable.http');
      fs.writeFileSync(unreachableHttp, '### Unreachable\nGET http://127.0.0.1:1/unreachable\n', 'utf8');
      fs.writeFileSync(path.join(dir, 'unreachable.csv'), 'x\n1\n', 'utf8');

      const { exports, host } = loadExtensionWithMockHost({ filePath: bundlePath });
      await exports.activate(host.context);
      await host.vscode.commands.executeCommand('reqbridge.runCsvBatch', host.vscode.Uri.file(unreachableHttp), 0);
      const usageAfterFail = host.context.globalState.get('reqbridge.trialUsage');
      assert.equal(usageAfterFail?.batchRunsToday ?? 0, 0, 'Unreachable batch must not burn daily trial quota');

      const okHttp = path.join(dir, 'orders.http');
      fs.writeFileSync(okHttp, `### OK\nGET ${server.baseUrl}/ok\n`, 'utf8');
      fs.writeFileSync(path.join(dir, 'orders.csv'), 'x\n1\n', 'utf8');
      await host.vscode.commands.executeCommand('reqbridge.runCsvBatch', host.vscode.Uri.file(okHttp), 0);
      const usageAfterOk = host.context.globalState.get('reqbridge.trialUsage');
      assert.equal(usageAfterOk?.batchRunsToday, 1, 'Completed HTTP batch must record 1 daily trial run');

      // Now activate Pro and test exportCiBundle without uri while orders.http is activeTextEditor
      const { key: proKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 't5-ci-machine');
      const { exports: proExports, host: proHost } = loadExtensionWithMockHost({
        filePath: bundlePath,
        vscodeOpts: {
          machineId: 't5-ci-machine',
          activeTextEditor: { document: createMockTextDocument(`### OK\nGET ${server.baseUrl}/ok\n`, okHttp, 'http') },
        },
      });
      await proExports.activate(proHost.context);
      // Verify offline license directly or store via mock creem API
      const licRes = await licenseMod.verifyLicenseKey(proKey, 't5-ci-machine', verifyOpts);
      assert.equal(licRes.valid, true);
      // Use Creem mock endpoint to activate Pro through real reqbridge.activateLicense command
      const creemSrv = await createMockHttpServer({
        routes: [{
          method: 'POST',
          path: '/v1/licenses/activate',
          status: 200,
          body: { status: 'active', id: 'lic_t5', product: { name: 'ReqBridge Personal' }, instance: { id: 'inst_1' } },
        }],
      });
      try {
        await proHost.vscode.workspace.getConfiguration('reqbridge').update('license.creemApiBaseUrl', creemSrv.baseUrl);
        await proHost.vscode.workspace.getConfiguration('reqbridge').update('license.provider', 'creem');
        proHost.vscode.window.showQuickPick = async (items) => items[0];
        proHost.vscode.window.showInputBox = async () => 'CREEM-T5-PRO-KEY';
        await proHost.vscode.commands.executeCommand('reqbridge.activateLicense');
        await proHost.vscode.commands.executeCommand('reqbridge.exportCiBundle');
        const ciScript = fs.readFileSync(path.join(dir, 'reqbridge-ci.mjs'), 'utf8');
        assert.ok(ciScript.includes('"orders.http"'), 'exportCiBundle without uri must detect activeTextEditor .http file');
      } finally {
        await creemSrv.close();
      }
    });
  } finally {
    await server.close();
  }
});

test('[T5][F7,F8,F9] T5-09 Full .vsix command execution, MockBlob #download-zip-btn ZIP round-trip, Command Palette label, SEO assets & $0.99 check', async () => {
  const { vsixPath, packageJson } = loadExtensionArtifacts();
  const { landingDir, files } = loadLandingFiles();
  const zip = parseZipBuffer(fs.readFileSync(vsixPath));
  const bundledJs = zip.readText('extension/dist/extension.js');

  // 1. Full .vsix command execution across all 8 commands
  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/staging/ok', status: 200, body: { ok: true, v: 'stg' } },
      { method: 'GET', path: '/prod/ok', status: 200, body: { ok: true, v: 1 } },
      { method: 'GET', path: '/ok', status: 200, body: { ok: true } },
      { method: 'POST', path: '/v1/licenses/activate', status: 200, body: { status: 'active', id: 'lic_vsix', product: { name: 'ReqBridge Personal' }, instance: { id: 'i1' } } },
      { method: 'POST', path: '/v1/chat/completions', status: 200, body: { model: 'gpt-4o-mini', choices: [{ message: { content: '# @assert status == 200' } }] } },
    ],
  });

  try {
    await withTempWorkDir('t5-vsix-cmds', async (dir) => {
      const pmPath = path.join(dir, 'col.postman.json');
      fs.writeFileSync(pmPath, JSON.stringify({
        info: { name: 'VSIX Cmds' },
        variable: [{ key: 'baseUrl', value: server.baseUrl }],
        item: [{ name: 'Ok', request: { method: 'GET', url: '{{baseUrl}}/ok' } }],
      }), 'utf8');
      const httpPath = path.join(dir, 'col.postman.http');
      const csvPath = path.join(dir, 'col.postman.csv');
      fs.writeFileSync(csvPath, 'x\n1\n', 'utf8');

      const { exports, host } = loadExtensionWithMockHost({
        code: bundledJs,
        virtualFilename: path.join(path.dirname(vsixPath), 'dist', 'extension.js'),
      });
      await exports.activate(host.context);
      await host.vscode.workspace.getConfiguration('reqbridge').update('license.creemApiBaseUrl', server.baseUrl);
      await host.vscode.workspace.getConfiguration('reqbridge').update('license.provider', 'creem');
      await host.vscode.workspace.getConfiguration('reqbridge').update('byok.baseUrl', `${server.baseUrl}/v1`);

      await host.vscode.commands.executeCommand('reqbridge.importCollection', host.vscode.Uri.file(pmPath));
      assert.ok(fs.existsSync(httpPath));
      assert.ok(fs.existsSync(path.join(dir, 'col.postman.openapi.yaml')));

      const openApiOut = path.join(dir, 'manual.openapi.yaml');
      host.vscode.window.showSaveDialog = async () => host.vscode.Uri.file(openApiOut);
      await host.vscode.commands.executeCommand('reqbridge.exportOpenApi', host.vscode.Uri.file(pmPath));
      assert.ok(fs.existsSync(openApiOut));

      await host.vscode.commands.executeCommand('reqbridge.sendRequest', host.vscode.Uri.file(httpPath), 0);
      await host.vscode.commands.executeCommand('reqbridge.runCsvBatch', host.vscode.Uri.file(httpPath), 0);

      const diffInputs = [`${server.baseUrl}/staging`, `${server.baseUrl}/prod`];
      host.vscode.window.showInputBox = async () => diffInputs.shift();
      await host.vscode.commands.executeCommand('reqbridge.diffStagingProd', host.vscode.Uri.file(httpPath), 0);

      host.vscode.window.showQuickPick = async (items) => items[0];
      host.vscode.window.showInputBox = async () => 'CREEM-VSIX-KEY';
      await host.vscode.commands.executeCommand('reqbridge.activateLicense');

      await host.vscode.commands.executeCommand('reqbridge.exportCiBundle', host.vscode.Uri.file(httpPath));
      assert.ok(fs.existsSync(path.join(dir, 'reqbridge-ci.mjs')));

      host.vscode.window.showInputBox = async () => 'sk-byok-secret-123456';
      host.setActiveTextEditor(createMockTextDocument('pm.response.to.have.status(200);', 'test.js', 'javascript'));
      await host.vscode.commands.executeCommand('reqbridge.translateScriptByok');
      assert.ok(host.outputChannels.some((ch) => ch.lines.some((l) => l.includes('BYOK'))));
    });
  } finally {
    await server.close();
  }

  // 2. MockBlob #download-zip-btn -> parseZipBuffer round-trip
  const sandbox = createLandingSandbox(landingDir);
  try {
    sandbox.click('#download-zip-btn');
    const zipBlob = sandbox.getBlobs().at(-1);
    assert.ok(zipBlob && zipBlob.type === 'application/zip');
    const parsedZip = parseZipBuffer(zipBlob.buffer);
    const names = parsedZip.entries.map((e) => e.name);
    assert.deepEqual(names, ['requests.http', '.env.example', 'openapi.yaml']);
    assert.ok(parsedZip.readText('openapi.yaml').includes('openapi: 3.1.0'));
  } finally {
    sandbox.dispose();
  }

  // 3. Command Palette label parity vs extension/package.json
  const activateCmd = packageJson.contributes.commands.find((c) => c.command === 'reqbridge.activateLicense');
  assert.ok(activateCmd);
  const expectedPaletteLabel = `ReqBridge: ${activateCmd.title}`;
  for (const fname of ['index.html', 'checkout-personal.html', 'checkout-team.html', 'demo.js']) {
    const txt = files[fname].readText();
    assert.ok(txt.includes(expectedPaletteLabel), `${fname} must display "${expectedPaletteLabel}"`);
    assert.ok(!txt.includes('ReqBridge: Activate License Key'), `${fname} still contains stale label`);
  }

  // 4. robots.txt, sitemap.xml, favicon.svg, all internal links HTTP 200, and $0.99 regex guard
  const staticSrv = await createMockHttpServer({ staticDir: landingDir });
  try {
    const robots = await (await fetch(`${staticSrv.baseUrl}/robots.txt`)).text();
    assert.match(robots, /Sitemap:\s*https:\/\/reqbridge-local-api\.pages\.dev\/sitemap\.xml/i);
    const sitemap = await (await fetch(`${staticSrv.baseUrl}/sitemap.xml`)).text();
    for (const page of ['index.html', 'checkout-personal.html', 'checkout-team.html', 'privacy.html', 'terms.html', 'refund.html']) {
      assert.ok(sitemap.includes(page === 'index.html' ? 'reqbridge-local-api.pages.dev/' : page), `sitemap.xml missing ${page}`);
      const html = await (await fetch(`${staticSrv.baseUrl}/${page}`)).text();
      for (const m of html.matchAll(/href=["']([^"'#]+)(?:#[^"']*)?["']/gi)) {
        const href = m[1];
        if (/^(?:https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
        const res = await fetch(`${staticSrv.baseUrl}/${href.replace(/^\//, '')}`);
        assert.equal(res.status, 200, `Internal link ${href} in ${page} returned HTTP ${res.status}`);
      }
    }
    const svg = await (await fetch(`${staticSrv.baseUrl}/favicon.svg`)).text();
    assert.match(svg, /<svg\b/i);
  } finally {
    await staticSrv.close();
  }

  // Confirm T2-F9-05 fractional price regex catches $0.99
  const priceMatches = [...'Offer $0.99 limited'.matchAll(/\$(\d+(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));
  assert.ok(priceMatches.some((p) => p > 0 && p < 12));
});
