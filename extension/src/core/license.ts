import crypto from 'node:crypto';
import {
  LicenseLimits,
  LicenseStatus,
  LicenseTier,
  OfflineLicensePayload,
  TrialAllowanceResult,
  TrialUsageState,
  VerifyLicenseOptions,
} from './types';

export const DEFAULT_PUBLIC_KEY_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAPmCKWHOyaMNWvTFJT9A/sbVtuExcfba+Mni3UiQOInI=',
  '-----END PUBLIC KEY-----',
].join('\n');

const FREE_LIMITS: LicenseLimits = {
  migrationUnlimited: true,
  singleRequestUnlimited: true,
  singleEndpointDiffUnlimited: true,
  maxBatchCsvRows: 10,
  maxBatchRunsPerDay: 3,
  collectionWideDiff: false,
  ciExport: false,
  byok: false,
};

const PRO_LIMITS: LicenseLimits = {
  migrationUnlimited: true,
  singleRequestUnlimited: true,
  singleEndpointDiffUnlimited: true,
  maxBatchCsvRows: null,
  maxBatchRunsPerDay: null,
  collectionWideDiff: true,
  ciExport: true,
  byok: true,
};

export function buildFreeLicenseStatus(message = 'Running ReqBridge Free Core.'): LicenseStatus {
  return {
    valid: false,
    tier: 'free',
    provider: 'none',
    seats: 0,
    maxDevices: 1,
    message,
    limits: { ...FREE_LIMITS },
  };
}

function buildProStatus(
  tier: 'personal' | 'team',
  provider: 'offline-ed25519' | 'creem' | 'gumroad',
  opts: { seats?: number; maxDevices?: number; expiresAt?: string; licenseId?: string; message: string }
): LicenseStatus {
  return {
    valid: true,
    tier,
    provider,
    seats: opts.seats ?? (tier === 'team' ? 5 : 1),
    maxDevices: opts.maxDevices ?? (tier === 'team' ? 15 : 3),
    expiresAt: opts.expiresAt,
    licenseId: opts.licenseId,
    message: opts.message,
    limits: { ...PRO_LIMITS },
  };
}

function verifyOfflineEd25519Key(
  key: string,
  machineId: string,
  opts?: VerifyLicenseOptions
): LicenseStatus {
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'RB1' || !parts[1] || !parts[2]) {
    return buildFreeLicenseStatus('Malformed RB1 offline license key format.');
  }
  const [, payloadB64, sigB64] = parts;
  let sigBytes: Buffer;
  let payload: OfflineLicensePayload;
  try {
    sigBytes = Buffer.from(sigB64, 'base64url');
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as OfflineLicensePayload;
  } catch {
    return buildFreeLicenseStatus('Corrupted RB1 license key payload or signature encoding.');
  }

  let verified = false;
  try {
    const publicKey = crypto.createPublicKey(opts?.publicKeyPem || DEFAULT_PUBLIC_KEY_PEM);
    verified = crypto.verify(null, Buffer.from(`RB1.${payloadB64}`, 'utf8'), publicKey, sigBytes);
  } catch {
    return buildFreeLicenseStatus('Invalid Ed25519 verification public key.');
  }
  if (!verified) return buildFreeLicenseStatus('Invalid license signature: key verification failed.');
  if (payload.v !== 1 || (payload.plan !== 'personal' && payload.plan !== 'team')) {
    return buildFreeLicenseStatus('Unsupported offline license payload schema.');
  }

  const nowMs = opts?.nowMs ?? Date.now();
  if (payload.exp) {
    const expMs = Date.parse(payload.exp);
    if (Number.isNaN(expMs) || expMs <= nowMs) {
      return buildFreeLicenseStatus(`Offline license expired on ${payload.exp}.`);
    }
  }
  if (payload.machineLock) {
    const machineHash = crypto.createHash('sha256').update(machineId).digest('hex');
    if (payload.machineLock !== machineHash) {
      return buildFreeLicenseStatus('License key is locked to a different machine ID.');
    }
  }

  return buildProStatus(payload.plan, 'offline-ed25519', {
    seats: payload.seats,
    maxDevices: payload.maxDevices,
    expiresAt: payload.exp,
    licenseId: payload.id,
    message: `Verified offline ${payload.plan} license (${payload.id}).`,
  });
}

async function verifyCreemLicense(
  key: string,
  machineId: string,
  opts: VerifyLicenseOptions
): Promise<LicenseStatus> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = (
    opts.apiBaseUrl || (opts.testMode ? 'https://test-api.creem.io' : 'https://api.creem.io')
  ).replace(/\/+$/, '');
  const endpoint = opts.instanceId ? '/v1/licenses/validate' : '/v1/licenses/activate';
  const payload = opts.instanceId
    ? { key, instance_id: opts.instanceId }
    : { key, instance_name: machineId || 'reqbridge-host' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, opts.timeoutMs ?? 15000));
  try {
    const res = await fetchFn(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.status !== 'active') {
      const reason = typeof data.message === 'string' ? data.message : `status=${String(data.status || res.status)}`;
      return buildFreeLicenseStatus(`Creem license validation failed (${reason}).`);
    }
    const maxInst = typeof data.max_instances === 'number' ? data.max_instances : 3;
    const hintName = String(data.product_name || data.variant_name || '').toLowerCase();
    const tier: 'personal' | 'team' = maxInst >= 15 || hintName.includes('team') ? 'team' : 'personal';
    return buildProStatus(tier, 'creem', {
      maxDevices: maxInst,
      expiresAt: typeof data.expires_at === 'string' ? data.expires_at : undefined,
      licenseId: typeof data.id === 'string' ? data.id : key,
      message: `Activated Creem ${tier} license.`,
    });
  } catch (err) {
    return buildFreeLicenseStatus(`Creem verification network error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function verifyGumroadLicense(key: string, opts: VerifyLicenseOptions): Promise<LicenseStatus> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = (opts.apiBaseUrl || 'https://api.gumroad.com').replace(/\/+$/, '');
  const form = new URLSearchParams();
  if (opts.productId) form.set('product_id', opts.productId);
  form.set('license_key', key);
  form.set('increment_uses_count', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, opts.timeoutMs ?? 15000));
  try {
    const res = await fetchFn(`${baseUrl}/v2/licenses/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      purchase?: {
        refunded?: boolean;
        chargebacked?: boolean;
        disputed?: boolean;
        variants?: string;
        product_name?: string;
        id?: string;
      };
    };
    const p = data.purchase;
    if (!res.ok || !data.success || !p || p.refunded || p.chargebacked || p.disputed) {
      return buildFreeLicenseStatus(`Gumroad license rejected (${data.message || (p?.refunded ? 'refunded' : `HTTP ${res.status}`)})`);
    }
    const label = `${p.variants || ''} ${p.product_name || ''}`.toLowerCase();
    const tier: 'personal' | 'team' = label.includes('team') ? 'team' : 'personal';
    return buildProStatus(tier, 'gumroad', {
      licenseId: p.id || key,
      message: `Verified Gumroad ${tier} license.`,
    });
  } catch (err) {
    return buildFreeLicenseStatus(`Gumroad verification network error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyLicenseKey(
  key: string,
  machineId: string,
  opts?: VerifyLicenseOptions
): Promise<LicenseStatus> {
  const trimmed = (key || '').trim();
  if (!trimmed) return buildFreeLicenseStatus('No license key provided.');
  if (trimmed.startsWith('RB1.')) return verifyOfflineEd25519Key(trimmed, machineId, opts);
  if (opts?.onlineVerify === false) {
    return buildFreeLicenseStatus('Offline verification only supports signed RB1. license keys.');
  }
  if (opts?.provider === 'gumroad') return verifyGumroadLicense(trimmed, opts);
  return verifyCreemLicense(trimmed, machineId, opts || {});
}

export function checkTrialAllowance(
  status: LicenseStatus,
  usage: TrialUsageState,
  requestedRows: number,
  todayUtc?: string
): TrialAllowanceResult {
  const today = todayUtc ?? new Date().toISOString().slice(0, 10);
  const currentRuns = usage.date === today ? Math.max(0, usage.batchRunsToday) : 0;
  const tier: LicenseTier = status.valid ? status.tier : 'free';
  if (tier !== 'free') {
    return { allowed: true, remainingRunsToday: null, nextUsage: { date: today, batchRunsToday: currentRuns + 1 } };
  }
  const maxRows = status.limits.maxBatchCsvRows ?? 10;
  const maxRuns = status.limits.maxBatchRunsPerDay ?? 3;
  if (requestedRows > maxRows) {
    return {
      allowed: false,
      reason: `Free Core supports up to ${maxRows} CSV rows per batch run (requested ${requestedRows}). Upgrade to Pro ($19 one-time) for unlimited CSV rows.`,
      remainingRunsToday: Math.max(0, maxRuns - currentRuns),
      nextUsage: { date: today, batchRunsToday: currentRuns },
    };
  }
  if (currentRuns >= maxRuns) {
    return {
      allowed: false,
      reason: `Free Core daily trial limit reached (${maxRuns} batch runs/day). Upgrade to Pro ($19 one-time) for unlimited batch runs.`,
      remainingRunsToday: 0,
      nextUsage: { date: today, batchRunsToday: currentRuns },
    };
  }
  return {
    allowed: true,
    remainingRunsToday: maxRuns - (currentRuns + 1),
    nextUsage: { date: today, batchRunsToday: currentRuns + 1 },
  };
}
