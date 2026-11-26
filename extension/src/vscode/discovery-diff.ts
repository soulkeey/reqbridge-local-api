import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { parseInputCollection } from '../core/parsers';
import { toCurlCommand, toHttpFile, toOpenApiYaml } from '../core/transpiler';
import { getDefaultWorkspaceDir, openTextPreview, resolveInputSource, writeOutputFile } from './workspace-io';

const diffDocContents = new Map<string, string>();
let diffProviderRegistered = false;

function ensureDiffProvider(context: vscode.ExtensionContext): void {
  if (diffProviderRegistered || typeof vscode.workspace.registerTextDocumentContentProvider !== 'function') return;
  diffProviderRegistered = true;
  const reg = vscode.workspace.registerTextDocumentContentProvider('reqbridge-diff', {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return diffDocContents.get(uri.path) ?? '';
    },
  });
  context.subscriptions.push(reg);
}

function prettyJsonOrRaw(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

export async function maybeOpenNativeDiff(
  context: vscode.ExtensionContext,
  endpointLabel: string,
  stagingRaw: string,
  prodRaw: string
): Promise<void> {
  if (typeof vscode.commands.getCommands !== 'function' || typeof vscode.workspace.registerTextDocumentContentProvider !== 'function') {
    return;
  }
  const cmds = await vscode.commands.getCommands(true);
  if (!cmds.includes('vscode.diff')) return;
  ensureDiffProvider(context);
  const id = Date.now().toString(36);
  const leftKey = `/staging-${id}.json`;
  const rightKey = `/prod-${id}.json`;
  diffDocContents.set(leftKey, prettyJsonOrRaw(stagingRaw));
  diffDocContents.set(rightKey, prettyJsonOrRaw(prodRaw));
  const leftUri = vscode.Uri.parse(`reqbridge-diff:${leftKey}`);
  const rightUri = vscode.Uri.parse(`reqbridge-diff:${rightKey}`);
  await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `ReqBridge Diff: ${endpointLabel} (Staging ↔ Prod)`);
}

export async function runImportCurl(output: vscode.OutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selected = editor && 'selection' in editor && editor.selection ? editor.document.getText(editor.selection as vscode.Range).trim() : '';
  let clip = '';
  if (!selected && vscode.env.clipboard && typeof vscode.env.clipboard.readText === 'function') {
    const c = (await vscode.env.clipboard.readText()).trim();
    if (/^curl(?:\.exe)?(?:\s|$)/i.test(c)) clip = c;
  }
  const rawCurl = await vscode.window.showInputBox({
    prompt: 'Paste a cURL command to convert into .http + .env.example + OpenAPI 3.1',
    value: selected || clip || undefined,
    placeHolder: "curl -X POST https://api.example.com/v2/orders -H 'Content-Type: application/json' -d '{\"id\":1}'",
  });
  if (!rawCurl || !rawCurl.trim()) return;
  const col = parseInputCollection(rawCurl, 'curl');
  const { httpContent, envExample } = toHttpFile(col);
  const yaml = toOpenApiYaml(col);
  const baseDir = getDefaultWorkspaceDir();
  const baseName = 'curl-imported';
  await writeOutputFile(path.join(baseDir, `${baseName}.http`), httpContent);
  await writeOutputFile(path.join(baseDir, '.env.example'), envExample);
  await writeOutputFile(path.join(baseDir, `${baseName}.openapi.yaml`), yaml);
  output.appendLine(`[CURL] Imported cURL -> ${path.join(baseDir, `${baseName}.http`)}`);
  await openTextPreview(httpContent, 'http');
  void vscode.window.showInformationMessage('ReqBridge converted cURL -> curl-imported.http + .env.example + OpenAPI 3.1.');
}

async function scanThunderCandidates(): Promise<Array<{ label: string; fsPath: string; description: string }>> {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const dirs = [
    ...(vscode.workspace.workspaceFolders || []).flatMap((f) => [
      path.join(f.uri.fsPath, '.vscode', 'thunder-client'),
      path.join(f.uri.fsPath, 'thunder-tests'),
    ]),
    path.join(home, '.thunder-client'),
    path.join(appData, 'Code', 'User', 'globalStorage', 'rangav.vscode-thunder-client'),
    path.join(appData, 'Cursor', 'User', 'globalStorage', 'rangav.vscode-thunder-client'),
    path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rangav.vscode-thunder-client'),
    path.join(home, '.config', 'Code', 'User', 'globalStorage', 'rangav.vscode-thunder-client'),
  ];
  const seen = new Set<string>();
  const found: Array<{ label: string; fsPath: string; description: string }> = [];
  for (const dir of dirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.toLowerCase().endsWith('.json')) continue;
      if (!/thunder/i.test(ent.name) && !ent.name.startsWith('tc_')) continue;
      const full = path.join(dir, ent.name);
      try {
        const stat = await fs.stat(full);
        if (stat.size > 2 * 1024 * 1024) continue;
        const parsed = JSON.parse(await fs.readFile(full, 'utf8')) as Record<string, unknown>;
        if (!Array.isArray(parsed.requests)) continue;
        const label = String(parsed.collectionName || parsed.name || ent.name);
        found.push({ label, fsPath: full, description: `${parsed.requests.length} requests · ${dir}` });
      } catch { /* skip non-collection JSON */ }
    }
  }
  return found;
}

export async function runAutoDiscoverThunder(output: vscode.OutputChannel): Promise<void> {
  const candidates = await scanThunderCandidates();
  if (candidates.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'No local Thunder Client collection files found in workspace or VS Code globalStorage.',
      'Browse JSON File...'
    );
    if (choice === 'Browse JSON File...') await vscode.commands.executeCommand('reqbridge.importCollection');
    return;
  }
  const picked = candidates.length === 1
    ? candidates[0]
    : await vscode.window.showQuickPick(
        candidates.map((c) => `${c.label} — ${c.description}`),
        { placeHolder: 'Select a discovered Thunder Client collection to migrate to .http' }
      ).then((sel) => (sel ? candidates.find((c) => `${c.label} — ${c.description}` === sel) : undefined));
  if (!picked) return;
  await vscode.commands.executeCommand('reqbridge.importCollection', vscode.Uri.file(picked.fsPath));
  output.appendLine(`[DISCOVER] Migrated local Thunder Client collection: ${picked.fsPath}`);
}

export async function runCopyAsCurl(output: vscode.OutputChannel, uri?: vscode.Uri, blockIndex?: number): Promise<void> {
  const src = await resolveInputSource(uri, { canSelectFolders: false, openLabel: 'Select .http or Collection File' });
  if (!src) return;
  const col = parseInputCollection(src.content);
  if (col.requests.length === 0) return;
  const idx = typeof blockIndex === 'number' && blockIndex >= 0 && blockIndex < col.requests.length ? blockIndex : 0;
  const req = col.requests[idx];
  const curl = toCurlCommand(req);
  if (vscode.env.clipboard && typeof vscode.env.clipboard.writeText === 'function') {
    await vscode.env.clipboard.writeText(curl);
  }
  output.appendLine(`[CURL COPY] ${req.method} ${req.name}:\n${curl}`);
  void vscode.window.showInformationMessage(`Copied "${req.name}" as cURL to clipboard.`);
}
