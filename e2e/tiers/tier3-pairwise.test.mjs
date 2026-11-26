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
} from '../lib/contract-loader.mjs';
import { createLandingSandbox } from '../lib/dom-sandbox.mjs';
import { createMockHttpServer } from '../lib/mock-http.mjs';
import {
  assertMergedOrdersOpenApiBlock,
  checkTrialBlocked,
  findRunnerUrlInput,
  isProActive,
  isStatusDrift,
  makeResponseSample,
  obtainSignedTestLicense,
  readBrunoDirectoryFixture,
  readFixture,
  withTempWorkDir,
} from '../lib/test-helpers.mjs';
import { loadExtensionWithMockHost } from '../lib/vscode-host-mock.mjs';
import { parseZipBuffer } from '../lib/zip-reader.mjs';

const execFileAsync = promisify(execFile);

test('[T3][F2,F3] T3-01 Postman inherited Bearer auth + CSV rows execute via runBatch against 127.0.0.1', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { parseCsvRows, runBatch, exportJUnitXml } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [
      {
        method: 'POST',
        path: '/v2/orders',
        handler: ({ req, res, parsedBody }) => {
          if (req.headers.authorization !== 'Bearer tok_pairwise') {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end('{"error":"unauthorized"}');
            return;
          }
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: parsedBody?.orderId }));
        },
      },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('postman-v21.json'), 'postman');
    const createOrder = col.requests.filter((r) => r.name === 'Create Order');
    const rows = parseCsvRows(readFixture('batch-data.csv')).slice(0, 3);
    const report = await runBatch(createOrder, rows, { baseUrl: server.baseUrl, apiToken: 'tok_pairwise' }, { concurrency: 2, timeoutMs: 2000 });
    const xml = exportJUnitXml(report);

    assert.equal(report.passed ?? report.passedCount, 3);
    assert.equal(report.failed ?? report.failedCount, 0);
    assert.ok(xml.includes('<testsuite'));
    assert.equal(server.stats().requests.length, 3);
  } finally {
    await server.close();
  }
});

test('[T3][F2,F4] T3-02 parsed .http requests executed against staging & prod endpoints feed diffResponses', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { diffResponses } = await loadCoreModule('diff');

  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/staging/v2/orders', delayMs: 20, status: 200, body: { currency_code: 'USD', count: 5 } },
      { method: 'GET', path: '/prod/v2/orders', delayMs: 5, status: 200, body: { currency_code: 840, count: 5 } },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const reqSpec = col.requests[0];
    assert.equal(reqSpec.method, 'GET');

    const t0 = performance.now();
    const rStg = await fetch(`${server.baseUrl}/staging/v2/orders?status=paid`);
    const stgBody = await rStg.text();
    const stgMs = Math.round(performance.now() - t0);

    const t1 = performance.now();
    const rProd = await fetch(`${server.baseUrl}/prod/v2/orders?status=paid`);
    const prodBody = await rProd.text();
    const prodMs = Math.round(performance.now() - t1);

    const diff = diffResponses(
      reqSpec.url,
      makeResponseSample(rStg.status, stgMs, stgBody),
      makeResponseSample(rProd.status, prodMs, prodBody),
    );
    assert.equal(diff.hasBreakingChanges, true);
    assert.ok(JSON.stringify(diff).includes('currency_code'));
  } finally {
    await server.close();
  }
});

test('[T3][F2,F5] T3-03 Bruno directory -> toHttpFile -> exportCiBundle executes cleanly as child node process', async () => {
  const { parseBrunoDirectory } = await loadCoreModule('parsers');
  const { toHttpFile } = await loadCoreModule('transpiler');
  const { exportCiBundle } = await loadCoreModule('ci-exporter');

  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/v2/orders', status: 200, body: { items: [] } },
      { method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } },
    ],
  });

  try {
    await withTempWorkDir('t3-bruno-ci', async (dir) => {
      const col = parseBrunoDirectory(readBrunoDirectoryFixture());
      const { httpContent } = toHttpFile(col);
      const patchedHttp = httpContent.replace(/\{\{baseUrl\}\}/g, server.baseUrl).replace(/\{\{apiToken\}\}/g, 'tok_ci').replace(/\{\{orderId\}\}/g, 'ord_ci_1');
      fs.writeFileSync(path.join(dir, 'orders.http'), patchedHttp, 'utf8');

      const { runnerJs } = exportCiBundle('orders.http');
      const runnerFile = path.join(dir, 'runner.mjs');
      fs.writeFileSync(runnerFile, runnerJs, 'utf8');

      await execFileAsync(process.execPath, [runnerFile], { cwd: dir, timeout: 10000 });
      assert.ok(server.stats().requests.length >= 2);
    });
  } finally {
    await server.close();
  }
});

test('[T3][F3,F4] T3-04 batch execution against staging/prod combines JUnit failure report and schema diff', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { runBatch, exportJUnitXml } = await loadCoreModule('runner');
  const { diffResponses } = await loadCoreModule('diff');

  const server = await createMockHttpServer({
    routes: [
      { method: 'GET', path: '/staging/v2/orders', status: 500, body: { error: 'schema_error' } },
      { method: 'GET', path: '/prod/v2/orders', status: 200, body: { items: [{ id: 1 }] } },
    ],
  });

  try {
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const getReq = col.requests.filter((r) => r.method === 'GET');
    const batch = await runBatch(getReq, [{ status: 'paid' }], { baseUrl: `${server.baseUrl}/staging`, apiToken: 'tok' }, { timeoutMs: 2000 });
    const xml = exportJUnitXml(batch);
    assert.ok(xml.includes('<failure'));

    const prodRes = await fetch(`${server.baseUrl}/prod/v2/orders`);
    const stgRes = await fetch(`${server.baseUrl}/staging/v2/orders`);
    const diff = diffResponses(
      '/v2/orders',
      makeResponseSample(stgRes.status, 25, await stgRes.text()),
      makeResponseSample(prodRes.status, 12, await prodRes.text()),
    );
    assert.equal(isStatusDrift(diff), true);
  } finally {
    await server.close();
  }
});

test('[T3][F3,F6] T3-05 pairwise license x rowCount matrix: Free+10 pass, Free+11 gated, Pro+15 pass', async () => {
  const licenseMod = await loadCoreModule('license');
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { parseCsvRows, runBatch } = await loadCoreModule('runner');

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } }],
  });

  try {
    const freeStatus = await licenseMod.verifyLicenseKey('', 'machine-pair', { onlineVerify: false });
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 10, 1), false);
    assert.equal(checkTrialBlocked(licenseMod, freeStatus, 11, 1), true);

    const { key: proKey, verifyOpts } = await obtainSignedTestLicense(licenseMod, 'personal', 'machine-pair');
    const proStatus = await licenseMod.verifyLicenseKey(proKey, 'machine-pair', verifyOpts);
    assert.equal(isProActive(proStatus), true);
    assert.equal(checkTrialBlocked(licenseMod, proStatus, 15, 10), false);

    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const rows15 = parseCsvRows(readFixture('batch-data.csv'));
    const report = await runBatch(postReq, rows15, { baseUrl: server.baseUrl, apiToken: 'tok' }, { concurrency: 4, timeoutMs: 2000 });
    assert.equal(report.passed ?? report.passedCount, 15);
  } finally {
    await server.close();
  }
});

test('[T3][F4,F5] T3-06 diffResponses Markdown report and exportCiBundle JUnit workflow compose cleanly', async () => {
  const diffMod = await loadCoreModule('diff');
  const { exportCiBundle } = await loadCoreModule('ci-exporter');

  const diff = diffMod.diffResponses(
    'POST /v2/checkout',
    makeResponseSample(200, 80, { session: 's1', vat: 'req' }),
    makeResponseSample(200, 40, { session: 's1' }),
  );
  const formatter = diffMod.formatDiffMarkdown || diffMod.exportDiffMarkdown;
  const md = diff.markdown ?? (typeof formatter === 'function' ? formatter(diff) : '');
  const { workflowYml } = exportCiBundle('checkout.http', 'checkout.csv');

  assert.ok(md.includes('vat'));
  assert.ok(workflowYml.includes('checkout.http') && workflowYml.includes('checkout.csv'));
});

test('[T3][F6,F7] T3-07 Extension host SecretStorage + machineId wires license/commands on activation', async () => {
  const { packageJson, bundlePath } = loadExtensionArtifacts();
  const { exports, host } = loadExtensionWithMockHost({
    filePath: bundlePath,
    vscodeOpts: { machineId: 't3-machine-host' },
  });

  await exports.activate(host.context);
  assert.ok(host.registeredCommands.size >= packageJson.contributes.commands.length);
  const licenseCmd = [...host.registeredCommands.keys()].find((id) => /license|activate|pro/i.test(id));
  assert.ok(licenseCmd, 'Extension must register a license/activation command');
});

test('[T3][F2,F8] T3-08 Core parser/transpiler parity with landing/demo.js on Postman v2.1 fixture', async () => {
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { toHttpFile, toOpenApiYaml } = await loadCoreModule('transpiler');
  const { landingDir } = loadLandingFiles();

  const rawPostman = readFixture('postman-v21.json');
  const coreCol = parseInputCollection(rawPostman, 'postman');
  const coreHttp = toHttpFile(coreCol).httpContent;
  const coreYaml = toOpenApiYaml(coreCol);

  const sandbox = createLandingSandbox(landingDir);
  try {
    sandbox.setValue('postman-input', rawPostman);
    await sandbox.flush(320);
    const webHttp = sandbox.el('converter-output').textContent;
    sandbox.click('.format-btn[data-format="openapi"]');
    const webYaml = sandbox.el('converter-output').textContent;

    assert.ok(coreHttp.includes('GET {{baseUrl}}/v2/orders') && webHttp.includes('GET {{baseUrl}}/v2/orders'));
    assert.ok(coreHttp.includes('POST {{baseUrl}}/v2/orders') && webHttp.includes('POST {{baseUrl}}/v2/orders'));
    assertMergedOrdersOpenApiBlock(coreYaml, 'T3-08 Core');
    assertMergedOrdersOpenApiBlock(webYaml, 'T3-08 Web');
  } finally {
    sandbox.dispose();
  }
});

test('[T3][F3,F8] T3-09 landing/demo.js CSV runner parity with Core F3 against 127.0.0.1 server', async () => {
  const { parseCsvRows, runBatch } = await loadCoreModule('runner');
  const { parseInputCollection } = await loadCoreModule('parsers');
  const { landingDir } = loadLandingFiles();

  const server = await createMockHttpServer({
    routes: [{ method: 'POST', path: '/v2/orders', status: 201, body: { ok: true } }],
  });

  try {
    const csvText = 'orderId,customer\nord_1,Alice\nord_2,Bob\n';
    const col = parseInputCollection(readFixture('sample.http'), 'http');
    const postReq = col.requests.filter((r) => r.method === 'POST');
    const coreReport = await runBatch(postReq, parseCsvRows(csvText), { baseUrl: server.baseUrl, apiToken: 'tok' }, { timeoutMs: 2000 });
    assert.equal(coreReport.passed ?? coreReport.passedCount, 2);

    server.resetStats();
    const sandbox = createLandingSandbox(landingDir, { fetchImpl: globalThis.fetch });
    try {
      const csvEl = sandbox.el('#csv-input') || sandbox.el('#batch-csv-input') || sandbox.el('[data-panel="runner"] textarea');
      assert.ok(csvEl, 'Tab 2 CSV input required');
      const urlEl = findRunnerUrlInput(sandbox);
      if (urlEl) sandbox.setValue(urlEl, `${server.baseUrl}/v2/orders`);
      sandbox.setValue(csvEl, csvText);
      sandbox.click('#run-batch-btn');
      await sandbox.flush(320);

      assert.equal(server.stats().requests.length, 2, 'Web runner must execute the same 2 CSV rows via fetch()');
    } finally {
      sandbox.dispose();
    }
  } finally {
    await server.close();
  }
});

test('[T3][F7,F9] T3-10 extension/package.json + .vsix manifest align with landing/ CTAs and sitemap', () => {
  const { packageJson, vsixPath } = loadExtensionArtifacts();
  const { files } = loadLandingFiles();
  const zip = parseZipBuffer(fs.readFileSync(vsixPath));
  const vsixManifest = zip.readText('extension.vsixmanifest');
  const indexHtml = files['index.html'].readText();
  const sitemap = files['sitemap.xml'].readText();

  const extId = `${packageJson.publisher}.${packageJson.name}`;
  assert.equal(extId, 'soulkey-tools.reqbridge-local-api');
  assert.ok(vsixManifest.includes(packageJson.publisher) && vsixManifest.includes(packageJson.name));
  assert.ok(indexHtml.includes(extId) || /\.vsix/i.test(indexHtml), 'landing/index.html must reference Marketplace ID or .vsix');
  assert.ok(sitemap.includes('https://reqbridge-local-api.pages.dev/'));
});
