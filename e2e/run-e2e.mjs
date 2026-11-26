import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run as runNodeTests } from 'node:test';
import {
  CORE_CONTRACTS,
  getExtensionBundlePath,
  loadCoreModule,
} from './lib/contract-loader.mjs';
import { extractErrorDiagnostic, isContractTargetError } from './lib/diagnostics.mjs';
import { createLandingSandbox } from './lib/dom-sandbox.mjs';
import { createMockHttpServer } from './lib/mock-http.mjs';
import {
  E2E_DIR,
  readBrunoDirectoryFixture,
  readFixture,
  withTempWorkDir,
} from './lib/test-helpers.mjs';
import { createMockTextDocument, loadExtensionWithMockHost } from './lib/vscode-host-mock.mjs';
import { createSyntheticZip, parseZipBuffer } from './lib/zip-reader.mjs';

const TIER_FILES = {
  1: path.join(E2E_DIR, 'tiers', 'tier1-smoke.test.mjs'),
  2: path.join(E2E_DIR, 'tiers', 'tier2-edges.test.mjs'),
  3: path.join(E2E_DIR, 'tiers', 'tier3-pairwise.test.mjs'),
  4: path.join(E2E_DIR, 'tiers', 'tier4-scenarios.test.mjs'),
  5: path.join(E2E_DIR, 'tiers', 'tier5-adversarial.test.mjs'),
};

function parseArgs(argv) {
  let tier = 'all';
  let selfCheck = false;
  let json = false;
  let includeTier5 = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-check') {
      selfCheck = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--include-tier5') {
      includeTier5 = true;
    } else if (arg === '--tier') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) {
        return { error: 'Missing value for --tier. Expected 1|2|3|4|5|all.' };
      }
      i += 1;
      tier = val;
    } else if (arg.startsWith('--tier=')) {
      tier = arg.slice('--tier='.length);
    } else {
      return { error: `Unknown argument: ${arg}` };
    }
  }

  if (!['1', '2', '3', '4', '5', 'all'].includes(tier)) {
    return { error: `Invalid --tier "${tier}". Expected 1|2|3|4|5|all.` };
  }

  return { tier, selfCheck, json, includeTier5 };
}

async function runSelfCheck(jsonMode) {
  const checks = [];
  async function check(name, fn) {
    const start = performance.now();
    try {
      await fn();
      checks.push({ name, ok: true, durationMs: Math.round(performance.now() - start) });
    } catch (err) {
      checks.push({
        name,
        ok: false,
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 1. mock-http.mjs check (ephemeral port, parallel inFlight/maxInFlight, static landing/)
  await check('mock-http.mjs: ephemeral server, maxInFlight tracking, static landing/', async () => {
    const rootDir = path.resolve(E2E_DIR, '..');
    const landingDir = path.join(rootDir, 'landing');
    const srv = await createMockHttpServer({
      staticDir: landingDir,
      routes: [
        { method: 'GET', path: '/api/slow', delayMs: 40, status: 200, body: { ok: true } },
        { method: 'POST', path: '/v1/licenses/validate', status: 200, body: { valid: true } },
      ],
    });
    try {
      assert.ok(srv.port > 0);
      const [r1, r2, r3] = await Promise.all([
        fetch(`${srv.baseUrl}/api/slow`),
        fetch(`${srv.baseUrl}/api/slow`),
        fetch(`${srv.baseUrl}/index.html`),
      ]);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 200);
      const stats = srv.stats();
      assert.ok(stats.maxInFlight >= 2, `Expected maxInFlight >= 2, got ${stats.maxInFlight}`);
      assert.equal(stats.inFlight, 0);
    } finally {
      await srv.close();
    }
  });

  // 2. dom-sandbox.mjs check against real landing/index.html + landing/demo.js
  await check('dom-sandbox.mjs: executes landing/index.html + landing/demo.js in node:vm', async () => {
    const landingDir = path.resolve(E2E_DIR, '..', 'landing');
    const sandbox = createLandingSandbox(landingDir);
    try {
      const output = sandbox.el('converter-output');
      const status = sandbox.el('converter-status');
      assert.ok(output && output.textContent.includes('GET {{baseUrl}}/v2/orders'));
      assert.equal(status.className, 'status-ok');
      sandbox.click('.format-btn[data-format="openapi"]');
      assert.ok(output.textContent.includes('openapi: 3.1.0'));
      const openApiBtn = sandbox.el('.format-btn[data-format="openapi"]');
      assert.equal(openApiBtn.closest('.format-btn'), openApiBtn);
      assert.ok(openApiBtn.closest('body') !== null);
      assert.equal(openApiBtn.closest('.nonexistent-ancestor-xyz'), null);
      assert.equal(sandbox.all('input:not([type="file"])').every((el) => el.getAttribute('type') !== 'file'), true);
      sandbox.click('#copy-converter-btn');
      await sandbox.flush(20);
      assert.ok(sandbox.getCopiedTexts().length >= 1);
    } finally {
      sandbox.dispose();
    }
  });

  // 3. zip-reader.mjs check (valid + tampered CRC + path traversal + truncated)
  await check('zip-reader.mjs: valid ZIP, CRC32 tamper detection, path traversal rejection', async () => {
    const goodZip = createSyntheticZip([
      { name: 'extension/package.json', content: '{"name":"reqbridge-local-api"}' },
      { name: 'extension/dist/extension.js', content: 'exports.activate = () => {};', deflate: false },
    ]);
    const parsed = parseZipBuffer(goodZip);
    assert.equal(parsed.entries.length, 2);
    assert.equal(JSON.parse(parsed.readText('extension/package.json')).name, 'reqbridge-local-api');

    const badCrc = createSyntheticZip([
      { name: 'extension/package.json', content: '{"name":"tampered"}', corruptCrc: true },
    ]);
    assert.throws(() => parseZipBuffer(badCrc), (err) => err?.code === 'ZIP_CRC_MISMATCH');

    const traversal = createSyntheticZip([
      { name: '../../evil.js', content: 'console.log("evil")' },
    ]);
    assert.throws(() => parseZipBuffer(traversal), (err) => err?.code === 'ZIP_PATH_TRAVERSAL');

    assert.throws(
      () => parseZipBuffer(goodZip.subarray(0, 20)),
      (err) => err?.code === 'ZIP_TRUNCATED' || err?.code === 'ZIP_EOCD_MISSING',
    );
  });

  // 4. vscode-host-mock.mjs check (valid activation + unexpected third-party require rejection)
  await check('vscode-host-mock.mjs: Module._load vscode mock & unexpected require rejection', async () => {
    const validBundle = `
      const vscode = require('vscode');
      const path = require('node:path');
      exports.activate = function(ctx) {
        ctx.subscriptions.push(vscode.commands.registerCommand('reqbridge.ping', () => path.basename('a.http')));
        ctx.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'http' }, {
          provideCodeLenses(doc) {
            return doc.getText().trim() ? [new vscode.CodeLens(new vscode.Range(0, 0, 0, 3), { title: 'Send', command: 'reqbridge.ping' })] : [];
          }
        }));
      };
    `;
    const { exports, host, unexpectedRequires } = loadExtensionWithMockHost({ code: validBundle });
    assert.equal(unexpectedRequires.length, 0);
    exports.activate(host.context);
    assert.equal(host.registeredCommands.has('reqbridge.ping'), true);
    const doc = createMockTextDocument('GET http://127.0.0.1/ok', 'test.http', 'http');
    const lenses = host.codeLensProviders[0].provider.provideCodeLenses(doc);
    assert.equal(lenses.length, 1);

    const badBundle = `const x = require('evil-third-party-pkg'); exports.activate = () => x;`;
    assert.throws(() => loadExtensionWithMockHost({ code: badBundle }), (err) => err?.code === 'UNEXPECTED_EXTENSION_REQUIRE');
  });

  // 5. contract-loader.mjs check (CONTRACT_TARGET_MISSING structure against empty root)
  await check('contract-loader.mjs: throws structured CONTRACT_TARGET_MISSING when targets absent', async () => {
    const prevRoot = process.env.REQBRIDGE_ROOT;
    await withTempWorkDir('selfcheck-empty-root', async (emptyDir) => {
      process.env.REQBRIDGE_ROOT = emptyDir;
      try {
        let caughtCore = null;
        try {
          await loadCoreModule('parsers');
        } catch (err) {
          caughtCore = err;
        }
        assert.ok(isContractTargetError(caughtCore), 'Expected ContractTargetError for missing core/parsers');
        assert.equal(caughtCore.code, 'CONTRACT_TARGET_MISSING');
        assert.equal(caughtCore.feature, 'F2');
        assert.equal(caughtCore.contractName, 'core/parsers');
        assert.ok(Array.isArray(caughtCore.probedPaths) && caughtCore.probedPaths.length > 0);
        assert.deepEqual(caughtCore.expectedExports, CORE_CONTRACTS.parsers.expectedExports);

        let caughtExt = null;
        try {
          getExtensionBundlePath();
        } catch (err) {
          caughtExt = err;
        }
        assert.ok(isContractTargetError(caughtExt), 'Expected ContractTargetError for missing extension bundle');
        assert.equal(caughtExt.feature, 'F7');
      } finally {
        if (prevRoot === undefined) delete process.env.REQBRIDGE_ROOT;
        else process.env.REQBRIDGE_ROOT = prevRoot;
      }
    });
  });

  // 6. fixtures/ check
  await check('fixtures/: all 6 required fixture sets present and syntactically valid', async () => {
    const postman = JSON.parse(readFixture('postman-v21.json'));
    assert.ok(Array.isArray(postman.item) && postman.item.length >= 2);
    const thunder = JSON.parse(readFixture('thunder-client.json'));
    assert.ok(Array.isArray(thunder.requests) && thunder.requests.length >= 2);
    const brunoSingle = readFixture('bruno-single.bru');
    assert.ok(brunoSingle.includes('post {') && brunoSingle.includes('auth:bearer'));
    const brunoDir = readBrunoDirectoryFixture();
    assert.ok(brunoDir.some((f) => f.path === 'bruno.json') && brunoDir.filter((f) => f.path.endsWith('.bru')).length >= 3);
    const sampleHttp = readFixture('sample.http');
    assert.ok(sampleHttp.includes('###') && sampleHttp.includes('@baseUrl'));
    const csvLines = readFixture('batch-data.csv').trim().split(/\r?\n/);
    assert.ok(csvLines.length >= 16, 'batch-data.csv must contain header + >10 rows');
  });

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  const payload = {
    ok: failed === 0,
    mode: 'self-check',
    summary: {
      total: checks.length,
      passed,
      failed,
    },
    checks,
    failures: checks.filter((c) => !c.ok),
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    console.log(`ReqBridge E2E Self-Check: ${passed}/${checks.length} passed`);
    for (const c of checks) {
      console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name} (${c.durationMs}ms)${c.error ? ` -> ${c.error}` : ''}`);
    }
  }

  return failed === 0 ? 0 : 1;
}

async function runTierSuite(tierArg, jsonMode, includeTier5 = false) {
  const selectedTiers =
    tierArg === 'all' ? (includeTier5 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]) : [Number(tierArg)];
  const files = selectedTiers.map((t) => TIER_FILES[t]);

  const byTier = {};
  for (const t of selectedTiers) {
    byTier[`T${t}`] = { total: 0, passed: 0, failed: 0 };
  }
  const byFeature = {};
  for (const f of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']) {
    byFeature[f] = { total: 0, passed: 0, failed: 0 };
  }

  const failures = [];
  let total = 0;
  let passed = 0;
  let failed = 0;

  const stream = runNodeTests({ files, concurrency: false });
  const TAG_RE = /^\[(T[1-5])\]\[([F0-9,]+)\]\s+(.+)$/;

  await new Promise((resolve, reject) => {
    stream.on('test:pass', (data) => {
      if (data?.details?.type === 'suite') return;
      const m = String(data?.name || '').match(TAG_RE);
      if (!m) return;
      const [, tierTag, featList] = m;
      total += 1;
      passed += 1;
      if (byTier[tierTag]) {
        byTier[tierTag].total += 1;
        byTier[tierTag].passed += 1;
      }
      for (const feat of featList.split(',')) {
        if (byFeature[feat]) {
          byFeature[feat].total += 1;
          byFeature[feat].passed += 1;
        }
      }
    });

    stream.on('test:fail', (data) => {
      if (data?.details?.type === 'suite') return;
      const name = String(data?.name || '');
      const m = name.match(TAG_RE);
      if (!m) {
        // Record unexpected file-level import/harness failure if not a tagged leaf test
        if (data?.nesting === 0 && !name.endsWith('.test.mjs')) return;
        if (!name.endsWith('.test.mjs')) return;
        const diag = extractErrorDiagnostic(data?.details?.error);
        failures.push({ test: name, tier: 'unknown', features: [], diagnostic: diag });
        return;
      }
      const [, tierTag, featList, title] = m;
      const features = featList.split(',');
      total += 1;
      failed += 1;
      if (byTier[tierTag]) {
        byTier[tierTag].total += 1;
        byTier[tierTag].failed += 1;
      }
      for (const feat of features) {
        if (byFeature[feat]) {
          byFeature[feat].total += 1;
          byFeature[feat].failed += 1;
        }
      }
      failures.push({
        test: `${tierTag} ${title}`,
        tier: tierTag,
        features,
        durationMs: Math.round(data?.details?.duration_ms ?? 0),
        diagnostic: extractErrorDiagnostic(data?.details?.error),
      });
    });

    stream.on('end', resolve);
    stream.on('error', reject);
    stream.resume();
  });

  const result = {
    ok: failed === 0 && total > 0 && failures.length === 0,
    mode: `tier:${tierArg}`,
    summary: {
      total,
      passed,
      failed,
    },
    byTier,
    byFeature,
    failures,
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(`ReqBridge E2E (${result.mode}): ${passed}/${total} passed, ${failed} failed`);
    console.log('By Tier:', Object.entries(byTier).map(([k, v]) => `${k}=${v.passed}/${v.total}`).join(' | '));
    console.log(
      'By Feature:',
      Object.entries(byFeature)
        .filter(([, v]) => v.total > 0)
        .map(([k, v]) => `${k}=${v.passed}/${v.total}`)
        .join(' | '),
    );
    if (failures.length > 0) {
      console.log('\nFailures:');
      for (const f of failures) {
        console.log(`  FAIL [${f.tier}][${f.features.join(',')}] ${f.test}`);
        console.log(`       ${f.diagnostic.code}: ${f.diagnostic.message}`);
      }
    }
  }

  return result.ok ? 0 : 1;
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: parsed.error }, null, 2)}\n`);
  } else {
    console.error(`Error: ${parsed.error}`);
  }
  process.exit(2);
}

const exitCode = parsed.selfCheck
  ? await runSelfCheck(parsed.json)
  : await runTierSuite(parsed.tier, parsed.json, parsed.includeTier5);

process.exitCode = exitCode;
