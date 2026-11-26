import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRootDir } from './contract-loader.mjs';

export const E2E_DIR = path.resolve(import.meta.dirname, '..');
export const FIXTURES_DIR = path.join(E2E_DIR, 'fixtures');

export function readFixture(relPath) {
  return fs.readFileSync(path.join(FIXTURES_DIR, relPath), 'utf8');
}

export function readBrunoDirectoryFixture() {
  const dir = path.join(FIXTURES_DIR, 'bruno-dir');
  const files = [];
  function walk(cur) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push({
          path: path.relative(dir, full).replace(/\\/g, '/'),
          content: fs.readFileSync(full, 'utf8'),
        });
      }
    }
  }
  walk(dir);
  return files;
}

export async function withTempWorkDir(prefix, fn) {
  const safePrefix = String(prefix || 'tmp').replace(/[^a-zA-Z0-9_-]/g, '-');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `reqbridge-e2e-${safePrefix}-`));
  try {
    return await fn(base);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

export function normalizeTier(status) {
  const t = String(status?.tier || status?.plan || status?.licenseTier || '').toLowerCase();
  if (t.includes('team')) return 'team';
  if (t.includes('personal') || t.includes('pro')) return 'personal';
  if (t.includes('free') || t.includes('trial')) return 'free';
  return t;
}

export function isProActive(status) {
  if (!status || typeof status !== 'object') return false;
  const tier = normalizeTier(status);
  const valid = status.valid ?? status.active ?? status.isPro ?? false;
  return Boolean(valid) && (tier === 'personal' || tier === 'team');
}

/**
 * Obtains a valid signed test license key + matching verification options.
 * Uses env keys if provided, exported signing helper if present, or real Ed25519 RB1 signing with test keypair.
 * Never fabricates or bypasses cryptographic verification.
 */
export async function obtainSignedTestLicense(licenseMod, tier = 'personal', machineId = 'e2e-machine-001', opts = {}) {
  if (tier === 'personal' && process.env.REQBRIDGE_TEST_PRO_KEY && !opts.expiresAt) {
    return { key: process.env.REQBRIDGE_TEST_PRO_KEY, verifyOpts: { onlineVerify: false } };
  }
  if (tier === 'team' && process.env.REQBRIDGE_TEST_TEAM_KEY && !opts.expiresAt) {
    return { key: process.env.REQBRIDGE_TEST_TEAM_KEY, verifyOpts: { onlineVerify: false } };
  }

  const signer =
    licenseMod.signLicenseKey ||
    licenseMod.issueLicenseKey ||
    licenseMod.createSignedLicenseKey ||
    licenseMod.generateLicenseKey;

  if (typeof signer === 'function') {
    const payload = {
      tier,
      plan: tier,
      machineId,
      seats: tier === 'team' ? 5 : 1,
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    };
    const result = await signer(payload);
    const key = typeof result === 'string' ? result : result?.key;
    assert.equal(typeof key, 'string', 'License signing helper must return a signed key string.');
    return { key, verifyOpts: { onlineVerify: false } };
  }

  // Real Ed25519 keypair + RB1.<payloadB64>.<sigB64> token verified via publicKeyPem option
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const machineLock = machineId
    ? crypto.createHash('sha256').update(machineId).digest('hex')
    : undefined;

  const payload = {
    v: 1,
    plan: tier === 'team' ? 'team' : 'personal',
    seats: tier === 'team' ? 5 : 1,
    maxDevices: tier === 'team' ? 15 : 3,
    id: `e2e_${tier}_001`,
    iat: '2026-11-26T00:00:00.000Z',
    exp: opts.expiresAt || '2028-11-26T00:00:00.000Z',
    ...(machineLock ? { machineLock } : {}),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const message = `RB1.${payloadB64}`;
  const sig = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64url');
  return {
    key: `${message}.${sig}`,
    verifyOpts: {
      onlineVerify: false,
      publicKeyPem,
      nowMs: opts.nowMs ?? Date.parse('2026-12-01T00:00:00.000Z'),
    },
  };
}

/**
 * Checks if a license status / trial gate blocks an execution for (rowCount, runsToday).
 */
export function checkTrialBlocked(licenseMod, status, rowCount, runsToday, dateStr = '2026-11-26') {
  if (!status || typeof status !== 'object') return true;
  if (typeof licenseMod.checkTrialAllowance === 'function') {
    const res = licenseMod.checkTrialAllowance(
      status,
      { date: dateStr, batchRunsToday: Math.max(0, runsToday - 1) },
      rowCount,
      dateStr,
    );
    return !res.allowed;
  }
  if (isProActive(status)) return false;
  const maxRows = Number(status.limits?.maxBatchCsvRows ?? status.maxRows ?? 10);
  const maxRuns = Number(status.limits?.maxBatchRunsPerDay ?? status.maxRunsPerDay ?? 3);
  return rowCount > maxRows || runsToday > maxRuns;
}

export function makeResponseSample(status, latencyMs, bodyText, headers = {}) {
  return {
    status,
    latencyMs,
    headers,
    bodyText: typeof bodyText === 'string' ? bodyText : JSON.stringify(bodyText),
  };
}

export function getLatencyMetrics(report) {
  const p50 = report?.p50LatencyMs ?? report?.p50Ms ?? report?.latency?.p50Ms ?? report?.stats?.p50Ms;
  const p95 = report?.p95LatencyMs ?? report?.p95Ms ?? report?.latency?.p95Ms ?? report?.stats?.p95Ms;
  return { p50, p95 };
}

export function isStatusDrift(diffReport) {
  if (typeof diffReport?.statusDrift === 'boolean') return diffReport.statusDrift;
  if (typeof diffReport?.statusMatch === 'boolean') return !diffReport.statusMatch;
  return diffReport?.stagingStatus !== diffReport?.prodStatus;
}

export function getExtensionDir() {
  return path.join(getRootDir(), 'extension');
}

export function assertMergedOrdersOpenApiBlock(yaml, label = 'OpenAPI YAML') {
  const orderHeaders = yaml.match(/^\s{2}\/v2\/orders:\s*$/gm) || [];
  assert.equal(orderHeaders.length, 1, `${label}: non-adjacent /v2/orders paths must merge under one /v2/orders: YAML key`);

  const marker = '  /v2/orders:';
  const start = yaml.search(/^\s{2}\/v2\/orders:\s*$/m);
  assert.ok(start >= 0, `${label}: missing /v2/orders: path block`);
  const afterHeader = start + marker.length;
  const rest = yaml.slice(afterHeader);
  const endOffset = rest.search(/\n(?:\s{2}\/|\S)/);
  const ordersBlock = endOffset === -1 ? yaml.slice(start) : yaml.slice(start, afterHeader + endOffset);

  assert.match(ordersBlock, /^\s{4}get:/m, `${label}: /v2/orders: block must contain get:`);
  assert.match(ordersBlock, /^\s{4}post:/m, `${label}: /v2/orders: block must contain post:`);
}

export function findRunnerUrlInput(sandbox) {
  return (
    sandbox.el('#batch-url-input') ||
    sandbox.el('#runner-url-input') ||
    sandbox.el('[data-panel="runner"] input[type="url"]') ||
    sandbox.el('[data-panel="runner"] input[type="text"]') ||
    sandbox.el('[data-panel="runner"] input:not([type="file"])')
  );
}

export function tamperSignedLicenseKey(validKey) {
  const parts = String(validKey).split('.');
  if (parts.length === 3 && parts[2].length >= 4) {
    const origSig = parts[2];
    const sigBuf = Buffer.from(origSig, 'base64url');
    assert.ok(sigBuf.length > 0, 'Expected non-empty signature bytes');
    const tamperedBuf = Buffer.from(sigBuf);
    tamperedBuf[0] ^= 0xff;
    const tamperedSig = tamperedBuf.toString('base64url');
    assert.notEqual(
      Buffer.compare(Buffer.from(origSig, 'base64url'), Buffer.from(tamperedSig, 'base64url')),
      0,
      'Tampered signature bytes must differ from original signature bytes',
    );
    return `${parts[0]}.${parts[1]}.${tamperedSig}`;
  }
  const mid = Math.floor(validKey.length / 2);
  const ch = validKey[mid];
  return `${validKey.slice(0, mid)}${ch === 'A' ? 'B' : 'A'}${validKey.slice(mid + 1)}`;
}
