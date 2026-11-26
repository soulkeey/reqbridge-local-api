import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { translateScriptWithByok } from '../src/core/byok';
import { buildFreeLicenseStatus, checkTrialAllowance, verifyLicenseKey } from '../src/core/license';
import { OfflineLicensePayload } from '../src/core/types';

function mintSignedKey(
  payload: OfflineLicensePayload,
  privateKey: crypto.KeyObject
): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const message = `RB1.${payloadB64}`;
  const sig = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64url');
  return `${message}.${sig}`;
}

function startMockLicenseAndByokServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (req.url === '/v1/licenses/activate') {
          const parsed = JSON.parse(body || '{}') as { key?: string };
          if (req.headers['x-api-key'] !== 'creem_pub_ok') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'unauthorized' }));
            return;
          }
          if (parsed.key === 'CREEM-TEAM-VALID') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: 'lic_1', status: 'active', max_instances: 15, product_name: 'Team 5-Seat' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'expired' }));
          return;
        }
        if (req.url === '/v2/licenses/verify') {
          const params = new URLSearchParams(body);
          const key = params.get('license_key');
          if (key === 'GUM-VALID') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, purchase: { id: 'gp_1', product_name: 'Personal', refunded: false } }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, purchase: { id: 'gp_2', refunded: true } }));
          return;
        }
        if (req.url === '/v1/chat/completions') {
          if (req.headers.authorization !== 'Bearer sk-user-openai') {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end(`bad key ${req.headers.authorization}`);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ model: 'gpt-4o-mini', choices: [{ message: { content: '# @assert status == 201' } }] }));
          return;
        }
        if (req.url?.startsWith('/v1beta/models/')) {
          if (req.url.includes('AIza') || req.headers['x-goog-api-key'] !== 'user-gem-key') {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('invalid gemini header');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '# @assert status == 200' }] } }] }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}

describe('Dual License Verification, Trial Limits & BYOK', () => {
  it('verifies real Ed25519 RB1 offline keys and rejects tampering, wrong key, expiry, and machine mismatch', async () => {
    const pairA = crypto.generateKeyPairSync('ed25519');
    const pairB = crypto.generateKeyPairSync('ed25519');
    const pubA = pairA.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const pubB = pairB.publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const machineHash = crypto.createHash('sha256').update('dev-box-1').digest('hex');
    const validKey = mintSignedKey(
      {
        v: 1,
        plan: 'team',
        seats: 5,
        maxDevices: 15,
        id: 'mbd_001',
        iat: '2026-11-26T00:00:00Z',
        exp: '2027-11-26T00:00:00Z',
        machineLock: machineHash,
      },
      pairA.privateKey
    );

    const ok = await verifyLicenseKey(validKey, 'dev-box-1', {
      publicKeyPem: pubA,
      nowMs: Date.parse('2026-12-01T00:00:00Z'),
    });
    assert.equal(ok.valid, true);
    assert.equal(ok.tier, 'team');
    assert.equal(ok.seats, 5);
    assert.equal(ok.limits.ciExport, true);

    const wrongMachine = await verifyLicenseKey(validKey, 'other-box', {
      publicKeyPem: pubA,
      nowMs: Date.parse('2026-12-01T00:00:00Z'),
    });
    assert.equal(wrongMachine.valid, false);
    assert.equal(wrongMachine.tier, 'free');

    const wrongPub = await verifyLicenseKey(validKey, 'dev-box-1', { publicKeyPem: pubB });
    assert.equal(wrongPub.valid, false);

    const expired = await verifyLicenseKey(validKey, 'dev-box-1', {
      publicKeyPem: pubA,
      nowMs: Date.parse('2028-01-01T00:00:00Z'),
    });
    assert.equal(expired.valid, false);

    const parts = validKey.split('.');
    const tampered = `${parts[0]}.${parts[1].slice(0, -2)}AA.${parts[2]}`;
    const badSig = await verifyLicenseKey(tampered, 'dev-box-1', { publicKeyPem: pubA });
    assert.equal(badSig.valid, false);

    const offlineNonRb1 = await verifyLicenseKey('CREEM-TEAM-VALID', 'dev-box-1', { onlineVerify: false });
    assert.equal(offlineNonRb1.valid, false);
  });

  it('enforces Free Core trial limits (10 rows, 3 runs/day, UTC rollover) vs unlimited Pro', () => {
    const free = buildFreeLicenseStatus();
    const r1 = checkTrialAllowance(free, { date: '2026-11-26', batchRunsToday: 0 }, 10, '2026-11-26');
    assert.equal(r1.allowed, true);
    assert.equal(r1.remainingRunsToday, 2);

    const tooManyRows = checkTrialAllowance(free, r1.nextUsage, 11, '2026-11-26');
    assert.equal(tooManyRows.allowed, false);

    const capHit = checkTrialAllowance(free, { date: '2026-11-26', batchRunsToday: 3 }, 5, '2026-11-26');
    assert.equal(capHit.allowed, false);
    assert.equal(capHit.remainingRunsToday, 0);

    const nextDay = checkTrialAllowance(free, { date: '2026-11-26', batchRunsToday: 3 }, 5, '2026-11-27');
    assert.equal(nextDay.allowed, true);
    assert.equal(nextDay.remainingRunsToday, 2);

    const pro = { ...free, valid: true, tier: 'personal' as const };
    const proOk = checkTrialAllowance(pro, { date: '2026-11-26', batchRunsToday: 99 }, 500, '2026-11-26');
    assert.equal(proOk.allowed, true);
    assert.equal(proOk.remainingRunsToday, null);
  });

  it('verifies online Creem/Gumroad licenses and BYOK OpenAI/Gemini translation via live node:http server', async () => {
    const { server, baseUrl } = await startMockLicenseAndByokServer();
    try {
      const creemOk = await verifyLicenseKey('CREEM-TEAM-VALID', 'host-1', {
        provider: 'creem',
        apiBaseUrl: baseUrl,
        apiKey: 'creem_pub_ok',
      });
      assert.equal(creemOk.valid, true);
      assert.equal(creemOk.tier, 'team');

      const creemBad = await verifyLicenseKey('CREEM-EXPIRED', 'host-1', {
        provider: 'creem',
        apiBaseUrl: baseUrl,
        apiKey: 'creem_pub_ok',
      });
      assert.equal(creemBad.valid, false);

      const gumOk = await verifyLicenseKey('GUM-VALID', 'host-1', {
        provider: 'gumroad',
        apiBaseUrl: baseUrl,
        productId: 'reqbridge',
      });
      assert.equal(gumOk.valid, true);
      assert.equal(gumOk.tier, 'personal');

      const gumRefunded = await verifyLicenseKey('GUM-REFUND', 'host-1', {
        provider: 'gumroad',
        apiBaseUrl: baseUrl,
      });
      assert.equal(gumRefunded.valid, false);

      const openaiRes = await translateScriptWithByok('pm.response.to.have.status(201);', {
        provider: 'openai',
        apiKey: 'sk-user-openai',
        baseUrl,
      });
      assert.deepEqual(openaiRes.assertions, ['# @assert status == 201']);

      const geminiRes = await translateScriptWithByok('pm.response.to.have.status(200);', {
        provider: 'gemini',
        apiKey: 'user-gem-key',
        baseUrl,
      });
      assert.deepEqual(geminiRes.assertions, ['# @assert status == 200']);

      await assert.rejects(
        () => translateScriptWithByok('pm.test()', { provider: 'openai', apiKey: '' }),
        /BYOK API key is required/
      );

      await assert.rejects(
        () =>
          translateScriptWithByok('pm.test()', {
            provider: 'openai',
            apiKey: 'sk-secret-must-redact',
            baseUrl,
          }),
        (err: unknown) => err instanceof Error && !err.message.includes('sk-secret-must-redact')
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
