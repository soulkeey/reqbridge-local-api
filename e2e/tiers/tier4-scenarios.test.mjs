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
  REQUIRED_LANDING_FILES,
} from '../lib/contract-loader.mjs';
import { createLandingSandbox } from '../lib/dom-sandbox.mjs';
import { createMockHttpServer } from '../lib/mock-http.mjs';
import {
  assertMergedOrdersOpenApiBlock,
  checkTrialBlocked,
  findRunnerUrlInput,
  isProActive,
  makeResponseSample,
  obtainSignedTestLicense,
  readBrunoDirectoryFixture,
  readFixture,
  tamperSignedLicenseKey,
  withTempWorkDir,
} from '../lib/test-helpers.mjs';
import { createMockTextDocument, loadExtensionWithMockHost } from '../lib/vscode-host-mock.mjs';
import { parseZipBuffer } from '../lib/zip-reader.mjs';

const execFileAsync = promisify(execFile);

test('[T4][F2,F3,F6] T4-01 Full migration & unlimited batch journey: Postman + Thunder -> .http/OpenAPI -> Pro unlock -> 15-row CSV batch', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toHttpFile, toOpenApiYaml } = await loadCoreModule('transpiler');
  const { parseCsvRows, runBatch, exportJUnitXml, exportBatchMarkdown } = await loadCoreModule('runner');
  const licenseMod = await loadCoreModule('license');

  const receivedOrders = [];
  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        handler: ({ res, parsedBody, req }) => {
          assert.equal(req.headers.authorization, 'Bearer e2e_pro_tok');
          receivedOrders.push(parsedBody);
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: parsedBody?.orderId, created: true }));
        },
      },
    ],
  });

  try {
    const pmCol = parseInputCollection(readFixture('postman-v21.json'), 'postman');
    const tcCol = parseInputCollection(readFixture('thunder-client.json'), 'thunder');
    assert.ok(pmCol.requests.length === 4 && tcCol.requests.length >= 2);

    const { httpContent, envExample } = toHttpFile(pmCol);
    const yaml = toOpenApiYaml(pmCol);
    assert.ok(httpContent.includes('GET {{baseUrl}}/v2/orders'));
    assert.ok(envExample.length > 0);
    assertMergedOrdersOpenApiBlock(yaml, 'T4-01');

    const { key: proKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 't4-journey-machine');
    const licStatus = await licenseMod.verifyLicenseKey(proKey, 't4-journey-machine', verifyOpts);
    assert.equal(isProActive(licStatus), true);

    const rows = parseCsvRows(readFixture('batch-data.csv'));
    assert.equal(rows.length, 15);
    assert.equal(checkTrialBlocked(licenseMod, licStatus, rows.length, 1), false);

    const createOrderReq = pmCol.requests.filter((r) => r.name === 'Create Order');
    const report = await runBatch(createOrderReq, rows, { baseUrl: server.baseUrl, apiToken: 'e2e_pro_tok' }, { concurrency: 4, timeoutMs: 3000 });

    assert.equal(receivedOrders.length, 15);
    assert.equal(report.passed ?? report.passedCount, 15);
    assert.equal(report.failed ?? report.failedCount, 0);

    const xml = exportJUnitXml(report);
    const md = exportBatchMarkdown(report);
    assert.ok(xml.includes('<testsuite') && xml.includes('<testcase'));
    assert.ok(md.includes('15'));
  } finally {
    await server.close();
  }
});

test('[T4][F2,F4,F5] T4-02 Staging vs Prod release gate & zero-lock-in CI subprocess execution', async () => {
  const { parseBrunoDirectory } = await loadCoreModule('parsers');
  const { toHttpFile } = await loadCoreModule('transpiler');
  const { diffResponses } = await loadCoreModule('diff');
  const { exportCiBundle } = await loadCoreModule('ci-exporter');

  let failServer = false;
  const server = await createMockHttpServer({
    routes: [
      {
        method: 'GET',
        path: '/v2/orders',
        handler: ({ res }) => {
          res.writeHead(failServer ? 500 : 200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(failServer ? { error: 'down' } : { items: [{ id: '1', price: '19.00' }] }));
        },
      },
      {
        method: 'POST',
        path: '/v2/orders',
        handler: ({ res }) => {
          res.writeHead(failServer ? 500 : 201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: !failServer }));
        },
      },
      { method: 'GET', path: '/prod/v2/orders', status: 200, body: { items: [{ id: '1', price: 1900 }] } },
      { method: 'GET', path: '/staging/v2/orders', status: 200, body: { items: [{ id: '1', price: '19.00' }] } },
    ],
  });

  try {
    await withTempWorkDir('t4-ci-gate', async (dir) => {
      const col = parseBrunoDirectory(readBrunoDirectoryFixture());
      const { httpContent } = toHttpFile(col);
      const localHttp = httpContent
        .replace(/\{\{baseUrl\}\}/g, server.baseUrl)
        .replace(/\{\{apiToken\}\}/g, 'tok_ci')
        .replace(/\{\{orderId\}\}/g, 'ord_99');

      fs.writeFileSync(path.join(dir, 'release.http'), localHttp, 'utf8');
      const { runnerJs } = exportCiBundle('release.http');
      const runnerFile = path.join(dir, 'runner.mjs');
      fs.writeFileSync(runnerFile, runnerJs, 'utf8');

      // Step 1: passing CI run
      await execFileAsync(process.execPath, [runnerFile], { cwd: dir, timeout: 10000 });

      // Step 2: failing server causes non-zero exit
      failServer = true;
      await assert.rejects(
        async () => await execFileAsync(process.execPath, [runnerFile], { cwd: dir, timeout: 10000 }),
        (err) => err && typeof err.code === 'number' && err.code !== 0,
      );

      // Step 3: paired staging vs prod schema diff catches price type shift
      const stgRes = await fetch(`${server.baseUrl}/staging/v2/orders`);
      const prodRes = await fetch(`${server.baseUrl}/prod/v2/orders`);
      const diff = diffResponses(
        '/v2/orders',
        makeResponseSample(stgRes.status, 35, await stgRes.text()),
        makeResponseSample(prodRes.status, 18, await prodRes.text()),
      );
      assert.equal(diff.hasBreakingChanges, true);
    });
  } finally {
    await server.close();
  }
});

test('[T4][F3,F6] T4-03 Free Core vs Pro trial-to-paid lifecycle: 3x5 runs pass, 4th/11-row blocked, tamper rejected, signed Pro unlocks 25 rows', async () => {
  const licenseMod = await loadCoreModule('license');
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } }],
  });

  try {
    const freeStatus = await licenseMod.verifyLicenseKey('', 't4-trial-machine', { onlineVerify: false });
    assert.equal(isProActive(freeStatus), false);
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 5, 1), false);
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 5, 2), false);
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 5, 3), false);
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 5, 4), true, '4th daily run under Free Trial must be blocked');
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 11, 1), true, '11 rows under Free Trial must be blocked');

    const { key: validKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 't4-trial-machine');
    const tampered = tamperSignedLicenseKey(validKey);
    assert.equal(isProActive(await licenseMod.verifyLicenseKey(tampered, 't4-trial-machine', verifyOpts)), false);

    const proStatus = await licenseMod.verifyLicenseKey(validKey, 't4-trial-machine', verifyOpts);
    assert.equal(isProActive(proStatus), true);
    assert.equal(checkTrialBlocked(licenseMod, proStatus, 25, 10), false);

    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const rows25 = Array.from({ length: 25 }, (_, i) => ({ orderId: `ord_${i + 1}`, customer: `User ${i + 1}` }));
    const report = await runBatch(postReq, rows25, { baseUrl: server.baseUrl, apiToken: 'tok' }, { concurrency: 5, timeoutMs: 3000 });
    assert.equal(report.passed ?? report.passedCount, 25);
  } finally {
    await server.close();
  }
});

test('[T4][F7,F2,F6] T4-04 Full .vsix ZIP extraction + in-memory extension activation + CodeLens + command execution', async () => {
  const { vsixPath, packageJson } = loadExtensionArtifacts();
  const zip = parseZipBuffer(fs.readFileSync(vsixPath));

  const pkgInVsix = JSON.parse(zip.readText('extension/package.json'));
  assert.equal(pkgInVsix.name, packageJson.name);
  assert.equal(pkgInVsix.publisher, 'soulkey-tools');

  const bundledJs = zip.readText('extension/dist/extension.js');
  assert.ok(bundledJs && bundledJs.length > 100, 'Packaged extension/dist/extension.js missing or empty');

  const { exports, host, unexpectedRequires } = loadExtensionWithMockHost({
    code: bundledJs,
    virtualFilename: path.join(path.dirname(vsixPath), 'dist', 'extension.js'),
    vscodeOpts: { machineId: 't4-vsix-host-machine' },
  });

  assert.equal(unexpectedRequires.length, 0);
  await exports.activate(host.context);

  for (const cmd of pkgInVsix.contributes.commands) {
    assert.ok(host.registeredCommands.has(cmd.command), `Command missing in packaged .vsix activation: ${cmd.command}`);
  }

  const doc = createMockTextDocument(readFixture('sample.http'), 'sample.http', 'http');
  host.setActiveTextEditor(doc);
  const lenses = [];
  for (const entry of host.codeLensProviders) {
    const items = await entry.provider.provideCodeLenses(doc, { isCancellationRequested: false });
    if (Array.isArray(items)) lenses.push(...items);
  }
  assert.ok(lenses.length >= 2);
});

test('[T4][F8,F2,F3,F4] T4-05 Browser landing interactive sandbox E2E: Tab 1 convert -> Tab 2 live CSV fetch -> Tab 3 live structural diff', async () => {
  const { landingDir } = loadLandingFiles();
  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { id: 'ord_web', ok: true } }],
  });
  const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });

  try {
    // Tab 1: Convert Postman with non-adjacent paths to OpenAPI 3.1
    sandbox.click('.ide-tab[data-tab="converter"]');
    sandbox.setValue('postman-input', readFixture('postman-v21.json'));
    await sandbox.flush(320);
    assert.equal(sandbox.el('converter-status').className, 'status-ok');
    sandbox.click('.format-btn[data-format="openapi"]');
    const yaml = sandbox.el('converter-output').textContent;
    assertMergedOrdersOpenApiBlock(yaml, 'T4-05');

    // Tab 2: Live CSV fetch batch against 127.0.0.1
    sandbox.click('.ide-tab[data-tab="runner"]');
    const csvEl = sandbox.el('#csv-input') || sandbox.el('#batch-csv-input') || sandbox.el('[data-panel="runner"] textarea');
    assert.ok(csvEl, 'Tab 2 editable CSV input required');
    const urlEl = findRunnerUrlInput(sandbox);
    if (urlEl) sandbox.setValue(urlEl, `${server.baseUrl}/v2/orders`);
    sandbox.setValue(csvEl, 'orderId,customer\nord_w1,Alice\nord_w2,Bob\nord_w3,Carol\n');
    sandbox.click('#run-batch-btn');
    await sandbox.flush(320);
    assert.equal(sandbox.getIntervalCount(), 0, 'No fake setInterval batch loop allowed');
    assert.ok(server.stats().requests.length >= 3);

    // Tab 3: Live structural diff on custom staging/prod payloads
    sandbox.click('.ide-tab[data-tab="diff"]');
    const stgEl = sandbox.el('#diff-staging-input') || sandbox.el('#diff-staging');
    const prodEl = sandbox.el('#diff-prod-input') || sandbox.el('#diff-prod');
    assert.ok(stgEl.tagName === 'TEXTAREA' || sandbox.el('#diff-staging-input'), 'Tab 3 editable staging input required');
    sandbox.setValue(stgEl, JSON.stringify({ order_total: '1900', added_flag: true }));
    sandbox.setValue(prodEl, JSON.stringify({ order_total: 1900, legacy_code: 'OLD' }));
    const runDiffBtn = sandbox.el('#run-diff-btn');
    if (runDiffBtn) runDiffBtn.click();
    await sandbox.flush(320);

    const bannerText = `${sandbox.el('#diff-banner').textContent}\n${sandbox.el('#diff-result')?.textContent || ''}`;
    assert.ok(bannerText.includes('order_total') && bannerText.includes('legacy_code'));
  } finally {
    sandbox.dispose();
    await server.close();
  }
});

test('[T4][F9,F7] T4-06 Live static site & compliance audit over 127.0.0.1 HTTP server across all 11 files', async () => {
  const { landingDir } = loadLandingFiles();
  const server = await createMockHttpServer({ staticDir: landingDir });

  try {
    for (const file of REQUIRED_LANDING_FILES) {
      const res = await fetch(`${server.baseUrl}/${file}`);
      assert.equal(res.status, 200, `Expected HTTP 200 for /${file}, got ${res.status}`);
      const body = await res.text();
      assert.ok(body.length > 0, `Empty HTTP response for /${file}`);

      if (file.endsWith('.html')) {
        assert.doesNotMatch(body, /\$0\s*charged\s*today|zero\s*card\s*charge\s*today|no\s*card\s*is\s*charged\s*today/i);
        assert.doesNotMatch(body, /(https?:)?\/\/(cdn\.|unpkg\.com|jsdelivr\.net|cdnjs\.|fonts\.googleapis\.com)/i);
      }
    }

    const indexRes = await fetch(`${server.baseUrl}/`);
    assert.equal(indexRes.status, 200);
    const indexHtml = await indexRes.text();
    assert.ok(indexHtml.includes('$19') && indexHtml.includes('$29'));
    assert.ok(indexHtml.includes('soulkey-tools.reqbridge-local-api') || /\.vsix/i.test(indexHtml));
  } finally {
    await server.close();
  }
});
