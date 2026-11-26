import crypto from 'node:crypto';
import * as vscode from 'vscode';
import {
  buildFreeLicenseStatus,
  checkTrialAllowance,
  verifyLicenseKey,
} from '../core/license';
import {
  LicenseStatus,
  TrialAllowanceResult,
  TrialUsageState,
  VerifyLicenseOptions,
} from '../core/types';

export const SECRET_LICENSE_KEY = 'reqbridge.licenseKey';
export const SECRET_BYOK_API_KEY = 'reqbridge.byokApiKey';
const STATE_TRIAL_USAGE = 'reqbridge.trialUsage';
const STATE_LICENSE_META = 'reqbridge.licenseMeta';

interface CachedLicenseMeta {
  keyHash: string;
  tier: 'personal' | 'team';
  provider: 'offline-ed25519' | 'creem' | 'gumroad';
  seats: number;
  maxDevices: number;
  expiresAt?: string;
  licenseId?: string;
}

function hashBinding(key: string, machineId: string): string {
  return crypto.createHash('sha256').update(`${key.trim()}|${machineId}`).digest('hex');
}

export function getLicenseVerifyOptions(): VerifyLicenseOptions {
  const cfg = vscode.workspace.getConfiguration('reqbridge');
  const providerCfg = String(cfg.get<string>('license.provider', 'auto'));
  const creemTestMode = Boolean(cfg.get<boolean>('license.creemTestMode', false));
  const creemApiBaseUrl = String(cfg.get<string>('license.creemApiBaseUrl', '')).trim();
  const gumroadProductId = String(cfg.get<string>('license.gumroadProductId', '')).trim();

  return {
    onlineVerify: providerCfg !== 'offline',
    provider: providerCfg === 'gumroad' ? 'gumroad' : providerCfg === 'creem' ? 'creem' : undefined,
    testMode: creemTestMode,
    apiBaseUrl: creemApiBaseUrl || undefined,
    productId: gumroadProductId || undefined,
  };
}

export function updateLicenseStatusBar(
  bar: vscode.StatusBarItem | undefined,
  status: LicenseStatus
): void {
  if (!bar) return;
  if (status.valid) {
    const planLabel = status.tier === 'team' ? 'Team' : 'Personal';
    bar.text = `ReqBridge: Pro (${planLabel})`;
    bar.tooltip = `${status.message} — Click to manage license or BYOK key`;
  } else {
    bar.text = 'ReqBridge: Free';
    bar.tooltip = 'ReqBridge Free Core (10 rows / 3 batch runs/day). Click to activate Pro ($19/$29 one-time).';
  }
  bar.command = 'reqbridge.activateLicense';
}

export async function getCurrentLicenseStatus(
  context: vscode.ExtensionContext,
  opts?: { allowOnlineCache?: boolean }
): Promise<LicenseStatus> {
  const storedKey = (await context.secrets.get(SECRET_LICENSE_KEY)) || '';
  if (!storedKey.trim()) {
    return buildFreeLicenseStatus();
  }
  const machineId = vscode.env.machineId || 'vscode-local';
  const offlineStatus = await verifyLicenseKey(storedKey, machineId, { onlineVerify: false });
  if (offlineStatus.valid) {
    return offlineStatus;
  }

  if (opts?.allowOnlineCache !== false && !storedKey.trim().startsWith('RB1.')) {
    const cached = context.globalState.get<CachedLicenseMeta | undefined>(STATE_LICENSE_META);
    const expectedHash = hashBinding(storedKey, machineId);
    if (cached && cached.keyHash === expectedHash) {
      const notExpired = !cached.expiresAt || Date.parse(cached.expiresAt) > Date.now();
      if (notExpired) {
        return {
          valid: true,
          tier: cached.tier,
          provider: cached.provider,
          seats: cached.seats,
          maxDevices: cached.maxDevices,
          expiresAt: cached.expiresAt,
          licenseId: cached.licenseId,
          message: `Cached ${cached.provider} ${cached.tier} license (${cached.licenseId || 'active'}).`,
          limits: {
            migrationUnlimited: true,
            singleRequestUnlimited: true,
            singleEndpointDiffUnlimited: true,
            maxBatchCsvRows: null,
            maxBatchRunsPerDay: null,
            collectionWideDiff: true,
            ciExport: true,
            byok: true,
          },
        };
      }
    }
  }
  return offlineStatus;
}

export async function hydrateStartupLicense(
  context: vscode.ExtensionContext,
  statusBar?: vscode.StatusBarItem
): Promise<LicenseStatus> {
  const status = await getCurrentLicenseStatus(context, { allowOnlineCache: true });
  updateLicenseStatusBar(statusBar, status);
  return status;
}

export async function activateAndSaveLicense(
  context: vscode.ExtensionContext,
  rawKey: string,
  statusBar?: vscode.StatusBarItem,
  overrideOpts?: VerifyLicenseOptions
): Promise<LicenseStatus> {
  const trimmed = rawKey.trim();
  const machineId = vscode.env.machineId || 'vscode-local';
  const verifyOpts = { ...getLicenseVerifyOptions(), ...overrideOpts };
  const status = await verifyLicenseKey(trimmed, machineId, verifyOpts);

  if (status.valid && (status.tier === 'personal' || status.tier === 'team')) {
    await context.secrets.store(SECRET_LICENSE_KEY, trimmed);
    const provider = status.provider === 'none' ? 'offline-ed25519' : status.provider;
    await context.globalState.update(STATE_LICENSE_META, {
      keyHash: hashBinding(trimmed, machineId),
      tier: status.tier,
      provider,
      seats: status.seats,
      maxDevices: status.maxDevices,
      expiresAt: status.expiresAt,
      licenseId: status.licenseId,
    } satisfies CachedLicenseMeta);
  }
  updateLicenseStatusBar(statusBar, status);
  return status;
}

export async function clearStoredLicense(
  context: vscode.ExtensionContext,
  statusBar?: vscode.StatusBarItem
): Promise<LicenseStatus> {
  await context.secrets.delete(SECRET_LICENSE_KEY);
  await context.globalState.update(STATE_LICENSE_META, undefined);
  const free = buildFreeLicenseStatus('License cleared. Running ReqBridge Free Core.');
  updateLicenseStatusBar(statusBar, free);
  return free;
}

export async function checkBatchTrialAllowance(
  context: vscode.ExtensionContext,
  rowCount: number
): Promise<{ status: LicenseStatus; allowance: TrialAllowanceResult }> {
  const status = await getCurrentLicenseStatus(context, { allowOnlineCache: true });
  const today = new Date().toISOString().slice(0, 10);
  const usage = context.globalState.get<TrialUsageState>(STATE_TRIAL_USAGE, {
    date: today,
    batchRunsToday: 0,
  });
  const allowance = checkTrialAllowance(status, usage, rowCount, today);
  return { status, allowance };
}

export async function recordBatchTrialRun(
  context: vscode.ExtensionContext,
  allowance: TrialAllowanceResult
): Promise<void> {
  if (allowance.allowed) {
    await context.globalState.update(STATE_TRIAL_USAGE, allowance.nextUsage);
  }
}

export async function checkAndRecordBatchTrial(
  context: vscode.ExtensionContext,
  rowCount: number
): Promise<{ status: LicenseStatus; allowance: TrialAllowanceResult }> {
  const res = await checkBatchTrialAllowance(context, rowCount);
  await recordBatchTrialRun(context, res.allowance);
  return res;
}

export function getTrialUsageSnapshot(context: vscode.ExtensionContext): TrialUsageState {
  const today = new Date().toISOString().slice(0, 10);
  const usage = context.globalState.get<TrialUsageState>(STATE_TRIAL_USAGE, {
    date: today,
    batchRunsToday: 0,
  });
  return usage.date === today ? usage : { date: today, batchRunsToday: 0 };
}
