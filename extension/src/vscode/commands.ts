import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { translateScriptWithByok } from '../core/byok';
import { exportCiBundle } from '../core/ci-exporter';
import { diffResponses, formatDiffMarkdown } from '../core/diff';
import { parseBrunoDirectory, parseInputCollection } from '../core/parsers';
import { exportBatchMarkdown, exportJUnitXml, parseCsvRows, runBatch } from '../core/runner';
import { toHttpFile, toOpenApiYaml } from '../core/transpiler';
import { ByokProvider, CollectionSpec, DiffReport } from '../core/types';
import {
  activateAndSaveLicense,
  checkBatchTrialAllowance,
  clearStoredLicense,
  getCurrentLicenseStatus,
  getTrialUsageSnapshot,
  recordBatchTrialRun,
  SECRET_BYOK_API_KEY,
} from './license-store';
import { renderBatchReportHtml, renderDiffReportHtml, renderSingleResponseHtml, showReportPanel } from './webview';
import { maybeOpenNativeDiff, runAutoDiscoverThunder, runCopyAsCurl, runImportCurl } from './discovery-diff';
import {
  collectBrunoFiles,
  fetchDiffSample,
  findSiblingDataFile,
  getDefaultWorkspaceDir,
  loadDirectoryEnv,
  openTextPreview,
  resolveInputSource,
  writeOutputFile,
} from './workspace-io';

const PRICING_URL = 'https://reqbridge-local-api.pages.dev/#pricing';

async function loadCollectionFromSource(uri?: vscode.Uri, allowDir = true): Promise<{ col: CollectionSpec; baseDir: string; baseName: string; fsPath?: string } | undefined> {
  const src = await resolveInputSource(uri, { canSelectFolders: allowDir, openLabel: 'Select Collection or .http File' });
  if (!src) return undefined;
  if (src.isDirectory && src.fsPath) {
    const files = await collectBrunoFiles(src.fsPath);
    return { col: parseBrunoDirectory(files), baseDir: src.baseDir, baseName: src.baseName, fsPath: src.fsPath };
  }
  const col = parseInputCollection(src.content);
  return { col, baseDir: src.baseDir, baseName: src.baseName, fsPath: src.fsPath };
}

function getBatchConfig(): { concurrency: number; timeoutMs: number } {
  const cfg = vscode.workspace.getConfiguration('reqbridge');
  return {
    concurrency: Math.max(1, Number(cfg.get<number>('batch.concurrency', 5)) || 5),
    timeoutMs: Math.max(500, Number(cfg.get<number>('batch.timeoutMs', 15000)) || 15000),
  };
}

function promptProUpgrade(msg: string): void {
  void vscode.window.showWarningMessage(`${msg} Upgrade to ReqBridge Pro ($19 Personal / $29 Team one-time).`, 'Activate Pro Key').then((choice) => {
    if (choice === 'Activate Pro Key') void vscode.commands.executeCommand('reqbridge.activateLicense');
  });
}

export function registerReqBridgeCommands(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  statusBar: vscode.StatusBarItem
): vscode.Disposable[] {
  const reg = (id: string, fn: (...args: any[]) => Promise<void>) =>
    vscode.commands.registerCommand(id, async (...args: any[]) => {
      try {
        await fn(...args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[ERROR] ${id}: ${msg}`);
        void vscode.window.showErrorMessage(`ReqBridge: ${msg}`);
      }
    });

  return [
    reg('reqbridge.importCollection', async (uri?: vscode.Uri) => {
      const loaded = await loadCollectionFromSource(uri, true);
      if (!loaded) return;
      const { httpContent, envExample } = toHttpFile(loaded.col);
      const yaml = toOpenApiYaml(loaded.col);
      const httpPath = path.join(loaded.baseDir, `${loaded.baseName}.http`);
      const envPath = path.join(loaded.baseDir, '.env.example');
      const yamlPath = path.join(loaded.baseDir, `${loaded.baseName}.openapi.yaml`);
      await writeOutputFile(httpPath, httpContent);
      await writeOutputFile(envPath, envExample);
      await writeOutputFile(yamlPath, yaml);
      output.appendLine(`Imported ${loaded.col.requests.length} requests -> ${httpPath}`);
      for (const w of loaded.col.warnings) output.appendLine(`[WARN] ${w}`);
      await openTextPreview(httpContent, 'http');
      void vscode.window.showInformationMessage(`ReqBridge imported ${loaded.col.requests.length} request(s) to ${path.basename(httpPath)} + .env.example + OpenAPI 3.1.`);
    }),

    reg('reqbridge.exportOpenApi', async (uri?: vscode.Uri) => {
      const loaded = await loadCollectionFromSource(uri, true);
      if (!loaded) return;
      const yaml = toOpenApiYaml(loaded.col);
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(loaded.baseDir, `${loaded.baseName}.openapi.yaml`)),
        filters: { 'OpenAPI YAML': ['yaml', 'yml'] },
      });
      const outPath = saveUri?.fsPath || path.join(loaded.baseDir, `${loaded.baseName}.openapi.yaml`);
      await writeOutputFile(outPath, yaml);
      await openTextPreview(yaml, 'yaml');
      output.appendLine(`Exported OpenAPI 3.1 YAML -> ${outPath}`);
      void vscode.window.showInformationMessage(`ReqBridge exported OpenAPI 3.1 YAML (${loaded.col.requests.length} requests).`);
    }),

    reg('reqbridge.sendRequest', async (uri?: vscode.Uri, blockIndex?: number) => {
      const loaded = await loadCollectionFromSource(uri, false);
      if (!loaded || loaded.col.requests.length === 0) return;
      const idx = typeof blockIndex === 'number' && blockIndex >= 0 && blockIndex < loaded.col.requests.length ? blockIndex : 0;
      const req = loaded.col.requests[idx];
      const env = { ...loaded.col.variables, ...(await loadDirectoryEnv(loaded.baseDir)) };
      const { timeoutMs } = getBatchConfig();
      const report = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `ReqBridge: Sending ${req.method} ${req.name}` },
        () => runBatch([req], [{}], env, { concurrency: 1, timeoutMs })
      );
      const row = report.results[0];
      output.appendLine(`[SEND] ${req.method} ${row?.url || req.url} -> ${row?.status ?? 0} (${row?.latencyMs ?? 0}ms)`);
      showReportPanel('reqbridge.response', `ReqBridge: ${req.name}`, renderSingleResponseHtml(req, report));
    }),

    reg('reqbridge.runCsvBatch', async (uri?: vscode.Uri, blockIndex?: number) => {
      const loaded = await loadCollectionFromSource(uri, false);
      if (!loaded || loaded.col.requests.length === 0) return;
      const targetReqs = typeof blockIndex === 'number' && loaded.col.requests[blockIndex] ? [loaded.col.requests[blockIndex]] : loaded.col.requests;
      let dataPath = await findSiblingDataFile(loaded.baseDir, loaded.baseName);
      if (!dataPath) {
        const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Batch Data': ['csv', 'json'] }, openLabel: 'Select CSV or JSON Batch File' });
        dataPath = picked?.[0]?.fsPath;
      }
      let rows: Array<Record<string, string>> = [];
      if (dataPath) {
        const raw = await fs.readFile(dataPath, 'utf8');
        if (dataPath.toLowerCase().endsWith('.json')) {
          const arr = JSON.parse(raw) as unknown;
          if (!Array.isArray(arr)) throw new Error('Batch JSON file must contain an array of row objects.');
          rows = arr.map((r) => Object.fromEntries(Object.entries((r || {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])));
        } else {
          rows = parseCsvRows(raw);
        }
      } else {
        const csvInline = await vscode.window.showInputBox({ prompt: 'No CSV file selected. Paste header,row CSV or leave blank for 1 default run.' });
        if (csvInline === undefined) return;
        rows = csvInline.trim() ? parseCsvRows(csvInline) : [{}];
      }
      if (rows.length === 0) rows = [{}];

      const { status, allowance } = await checkBatchTrialAllowance(context, rows.length);
      if (!allowance.allowed) {
        promptProUpgrade(allowance.reason || 'Free Core batch limit reached.');
        return;
      }
      const env = { ...loaded.col.variables, ...(await loadDirectoryEnv(loaded.baseDir)) };
      const { concurrency, timeoutMs } = getBatchConfig();
      const report = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `ReqBridge: Running ${rows.length} batch row(s)...` },
        () => runBatch(targetReqs, rows, env, { concurrency, timeoutMs })
      );
      await writeOutputFile(path.join(loaded.baseDir, `${loaded.baseName}-results.junit.xml`), exportJUnitXml(report));
      await writeOutputFile(path.join(loaded.baseDir, `${loaded.baseName}-report.md`), exportBatchMarkdown(report));
      if (report.results.some((r) => r.status > 0)) {
        await recordBatchTrialRun(context, allowance);
      }
      output.appendLine(`[BATCH] ${report.passedCount}/${report.totalExecutions} passed (p50=${report.p50LatencyMs}ms, p95=${report.p95LatencyMs}ms)`);
      showReportPanel('reqbridge.batchReport', 'ReqBridge Batch Report', renderBatchReportHtml(report, { tier: status.tier, remainingRunsToday: allowance.remainingRunsToday }));
    }),

    reg('reqbridge.diffStagingProd', async (uri?: vscode.Uri, blockIndex?: number) => {
      const loaded = await loadCollectionFromSource(uri, false);
      if (!loaded || loaded.col.requests.length === 0) return;
      const status = await getCurrentLicenseStatus(context);
      let reqs = typeof blockIndex === 'number' && loaded.col.requests[blockIndex] ? [loaded.col.requests[blockIndex]] : loaded.col.requests;
      if (reqs.length > 1 && !status.limits.collectionWideDiff) {
        promptProUpgrade('Collection-wide Staging vs Prod diff is a Pro feature; running single-endpoint diff on the first request.');
        reqs = [reqs[0]];
      }
      const env = { ...loaded.col.variables, ...(await loadDirectoryEnv(loaded.baseDir)) };
      const stagingBase = env.STAGING_URL || env.stagingUrl || (await vscode.window.showInputBox({ prompt: 'Enter Staging Base URL', value: 'http://127.0.0.1:8787' }));
      if (!stagingBase) return;
      const prodBase = env.PROD_URL || env.prodUrl || (await vscode.window.showInputBox({ prompt: 'Enter Production Base URL', value: 'https://api.example.com' }));
      if (!prodBase) return;
      const { timeoutMs } = getBatchConfig();
      const reports: DiffReport[] = [];
      let lastSamples: { label: string; stg: string; prd: string } | undefined;
      for (const req of reqs) {
        const [st, pr] = await Promise.all([fetchDiffSample(req, stagingBase, env, timeoutMs), fetchDiffSample(req, prodBase, env, timeoutMs)]);
        const rep = diffResponses(`${req.method} ${req.url}`, st, pr);
        reports.push(rep);
        lastSamples = { label: `${req.method} ${req.url}`, stg: st.bodyText, prd: pr.bodyText };
        output.appendLine(formatDiffMarkdown(rep));
      }
      showReportPanel('reqbridge.diffReport', 'ReqBridge Staging vs Prod Diff', renderDiffReportHtml(reports));
      if (reqs.length === 1 && lastSamples) {
        await maybeOpenNativeDiff(context, lastSamples.label, lastSamples.stg, lastSamples.prd);
      }
    }),

    reg('reqbridge.exportCiBundle', async (uri?: vscode.Uri) => {
      const status = await getCurrentLicenseStatus(context);
      if (!status.limits.ciExport) {
        promptProUpgrade('Zero-lock-in CI Bundle export requires ReqBridge Pro.');
        return;
      }
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const targetPath =
        uri?.fsPath ||
        (activeUri?.scheme === 'file' && /\.(?:http|rest)$/i.test(activeUri.fsPath) ? activeUri.fsPath : undefined);
      const baseDir = targetPath ? path.dirname(targetPath) : getDefaultWorkspaceDir();
      const httpName = targetPath ? path.basename(targetPath) : 'requests.http';
      const siblingCsv = await findSiblingDataFile(baseDir, path.basename(httpName, path.extname(httpName)));
      const { runnerJs, workflowYml } = exportCiBundle(httpName, siblingCsv ? path.basename(siblingCsv) : undefined);
      await writeOutputFile(path.join(baseDir, 'reqbridge-ci.mjs'), runnerJs);
      await writeOutputFile(path.join(baseDir, '.github', 'workflows', 'reqbridge-ci.yml'), workflowYml);
      output.appendLine(`Exported standalone CI bundle in ${baseDir}`);
      void vscode.window.showInformationMessage('ReqBridge exported reqbridge-ci.mjs + .github/workflows/reqbridge-ci.yml.');
    }),

    reg('reqbridge.activateLicense', async () => {
      const status = await getCurrentLicenseStatus(context);
      const usage = getTrialUsageSnapshot(context);
      const pick = await vscode.window.showQuickPick(
        [
          'Activate License Key (RB1. Offline / Creem / Gumroad)',
          'View License & Daily Trial Status',
          'Set BYOK AI API Key (SecretStorage)',
          'Clear Stored License',
          'Open Pricing & Checkout ($19 Personal / $29 Team)',
        ],
        { placeHolder: `Current Plan: ${status.valid ? `Pro (${status.tier})` : `Free (${usage.batchRunsToday}/3 batch runs today)`}` }
      );
      if (!pick) return;
      if (pick.startsWith('Activate')) {
        const key = await vscode.window.showInputBox({ prompt: 'Paste ReqBridge Pro license key (RB1.... or Creem/Gumroad key)', password: false });
        if (!key) return;
        const res = await activateAndSaveLicense(context, key, statusBar);
        if (res.valid) void vscode.window.showInformationMessage(res.message);
        else void vscode.window.showWarningMessage(res.message);
      } else if (pick.startsWith('View')) {
        void vscode.window.showInformationMessage(`${status.message} Today's batch runs: ${usage.batchRunsToday}.`);
      } else if (pick.startsWith('Set BYOK')) {
        const apiKey = await vscode.window.showInputBox({ prompt: 'Enter your OpenAI or Gemini API key (stored in VS Code SecretStorage)', password: true });
        if (apiKey?.trim()) {
          await context.secrets.store(SECRET_BYOK_API_KEY, apiKey.trim());
          void vscode.window.showInformationMessage('BYOK API key saved securely in SecretStorage.');
        }
      } else if (pick.startsWith('Clear')) {
        await clearStoredLicense(context, statusBar);
        void vscode.window.showInformationMessage('Stored license cleared.');
      } else {
        await vscode.env.openExternal(vscode.Uri.parse(PRICING_URL));
      }
    }),

    reg('reqbridge.translateScriptByok', async () => {
      const status = await getCurrentLicenseStatus(context);
      if (!status.limits.byok) {
        promptProUpgrade('BYOK script translation requires ReqBridge Pro.');
        return;
      }
      let apiKey = (await context.secrets.get(SECRET_BYOK_API_KEY)) || '';
      if (!apiKey.trim()) {
        apiKey = (await vscode.window.showInputBox({ prompt: 'Enter your OpenAI/Gemini API key for BYOK translation', password: true })) || '';
        if (!apiKey.trim()) return;
        await context.secrets.store(SECRET_BYOK_API_KEY, apiKey.trim());
      }
      const editor = vscode.window.activeTextEditor;
      const selected = editor && 'selection' in editor && editor.selection ? editor.document.getText(editor.selection as vscode.Range) : '';
      const script = selected.trim() || editor?.document.getText().trim() || (await vscode.window.showInputBox({ prompt: 'Paste pm.test() or Bruno test script to translate' })) || '';
      if (!script.trim()) return;
      const cfg = vscode.workspace.getConfiguration('reqbridge');
      const provider = (cfg.get<string>('byok.provider', 'openai') as ByokProvider) || 'openai';
      const result = await translateScriptWithByok(script, {
        provider,
        apiKey,
        model: String(cfg.get<string>('byok.model', '')).trim() || undefined,
        baseUrl: String(cfg.get<string>('byok.baseUrl', '')).trim() || undefined,
      });
      const out = result.assertions.join('\n');
      output.appendLine(`[BYOK ${result.provider}/${result.model}]\n${out}`);
      await openTextPreview(out, 'http');
    }),

    reg('reqbridge.importCurl', async () => runImportCurl(output)),
    reg('reqbridge.autoDiscoverThunder', async () => runAutoDiscoverThunder(output)),
    reg('reqbridge.copyAsCurl', async (uri?: vscode.Uri, blockIndex?: number) => runCopyAsCurl(output, uri, blockIndex)),
  ];
}
