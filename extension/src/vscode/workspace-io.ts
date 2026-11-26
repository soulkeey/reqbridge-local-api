import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { RequestSpec, ResponseSample } from '../core/types';

export interface ResolvedInputSource {
  content: string;
  fsPath?: string;
  baseDir: string;
  baseName: string;
  isDirectory?: boolean;
}

export function parseDotEnv(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (key) vars[key] = val;
  }
  return vars;
}

export async function loadDirectoryEnv(dirPath?: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  const candidates: string[] = [];
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (wsRoot) candidates.push(wsRoot);
  if (dirPath && !candidates.includes(dirPath)) candidates.push(dirPath);

  for (const dir of candidates) {
    for (const fileName of ['.env', '.env.local']) {
      try {
        const raw = await fs.readFile(path.join(dir, fileName), 'utf8');
        Object.assign(vars, parseDotEnv(raw));
      } catch {
        // Optional .env file may not exist
      }
    }
  }
  return vars;
}

export async function collectBrunoFiles(
  rootDir: string,
  relPrefix = ''
): Promise<Array<{ path: string; content: string }>> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const results: Array<{ path: string; content: string }> = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(rootDir, entry.name);
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...(await collectBrunoFiles(full, rel)));
    } else if (
      entry.isFile() &&
      (entry.name.toLowerCase().endsWith('.bru') || entry.name.toLowerCase() === 'bruno.json')
    ) {
      results.push({ path: rel, content: await fs.readFile(full, 'utf8') });
    }
  }
  return results;
}

export function getDefaultWorkspaceDir(fallbackDir?: string): string {
  return fallbackDir || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
}

export async function resolveInputSource(
  uri?: vscode.Uri,
  opts?: { canSelectFolders?: boolean; filters?: Record<string, string[]>; openLabel?: string }
): Promise<ResolvedInputSource | undefined> {
  if (uri?.fsPath) {
    const stat = await fs.stat(uri.fsPath).catch(() => undefined);
    if (stat?.isDirectory()) {
      return {
        content: '',
        fsPath: uri.fsPath,
        baseDir: uri.fsPath,
        baseName: path.basename(uri.fsPath) || 'collection',
        isDirectory: true,
      };
    }
    const content = await fs.readFile(uri.fsPath, 'utf8');
    return {
      content,
      fsPath: uri.fsPath,
      baseDir: path.dirname(uri.fsPath),
      baseName: path.basename(uri.fsPath, path.extname(uri.fsPath)) || 'requests',
    };
  }

  const activeDoc = vscode.window.activeTextEditor?.document;
  if (activeDoc) {
    const fsPath = activeDoc.uri?.fsPath;
    const hasRealPath = Boolean(fsPath && activeDoc.uri?.scheme === 'file');
    return {
      content: activeDoc.getText(),
      fsPath: hasRealPath ? fsPath : undefined,
      baseDir: hasRealPath && fsPath ? path.dirname(fsPath) : getDefaultWorkspaceDir(),
      baseName: hasRealPath && fsPath
        ? path.basename(fsPath, path.extname(fsPath))
        : 'requests',
    };
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: opts?.canSelectFolders ?? false,
    filters: opts?.filters,
    openLabel: opts?.openLabel || 'Select File',
  });
  if (!picked || picked.length === 0) return undefined;
  return resolveInputSource(picked[0], opts);
}

export async function writeOutputFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export async function openTextPreview(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  if (typeof vscode.window.showTextDocument === 'function') {
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}

export async function findSiblingDataFile(
  baseDir: string,
  baseName: string
): Promise<string | undefined> {
  const candidates = [
    path.join(baseDir, `${baseName}.csv`),
    path.join(baseDir, `${baseName}.json`),
    path.join(baseDir, 'sample-data.csv'),
    path.join(baseDir, 'data.csv'),
  ];
  for (const c of candidates) {
    try {
      const st = await fs.stat(c);
      if (st.isFile()) return c;
    } catch {
      // skip missing candidate
    }
  }
  return undefined;
}

function substituteTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).trim();
    const envKey = key.startsWith('$dotenv ') ? key.slice('$dotenv '.length).trim() : key;
    return Object.prototype.hasOwnProperty.call(vars, envKey) ? vars[envKey] : match;
  });
}

function replaceBaseUrl(rawUrl: string, targetBase: string, vars: Record<string, string>): string {
  const cleanBase = targetBase.replace(/\/+$/, '');
  if (/\{\{\s*(?:baseUrl|base_url)\s*\}\}/i.test(rawUrl)) {
    return substituteTemplateVars(rawUrl.replace(/\{\{\s*(?:baseUrl|base_url)\s*\}\}/gi, cleanBase), vars);
  }
  const resolved = substituteTemplateVars(rawUrl, vars);
  if (/^https?:\/\/[^/]+/i.test(resolved)) return resolved.replace(/^https?:\/\/[^/]+/i, cleanBase);
  return `${cleanBase}${resolved.startsWith('/') ? resolved : `/${resolved}`}`;
}

export async function fetchDiffSample(
  req: RequestSpec,
  targetBase: string,
  vars: Record<string, string>,
  timeoutMs: number
): Promise<ResponseSample> {
  const baseUrl = replaceBaseUrl(req.url, targetBase, vars);
  const queryParts = req.query.map((q) => {
    const k = encodeURIComponent(substituteTemplateVars(q.key, vars));
    const v = encodeURIComponent(substituteTemplateVars(q.value, vars));
    return `${k}=${v}`;
  });

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = substituteTemplateVars(v, vars);
  }
  const hasHeader = (name: string): boolean =>
    Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());

  if (req.auth && req.auth.type !== 'none') {
    if (req.auth.type === 'bearer' && !hasHeader('authorization')) {
      headers.Authorization = `Bearer ${substituteTemplateVars(req.auth.token || '', vars)}`;
    } else if (req.auth.type === 'basic' && !hasHeader('authorization')) {
      const creds = `${substituteTemplateVars(req.auth.username || '', vars)}:${substituteTemplateVars(req.auth.password || '', vars)}`;
      headers.Authorization = `Basic ${Buffer.from(creds, 'utf8').toString('base64')}`;
    } else if (req.auth.type === 'apikey') {
      const k = substituteTemplateVars(req.auth.key || 'X-Api-Key', vars);
      const v = substituteTemplateVars(req.auth.value || '', vars);
      if (req.auth.in === 'query') queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      else if (!hasHeader(k)) headers[k] = v;
    }
  }

  const finalUrl =
    queryParts.length > 0 ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryParts.join('&')}` : baseUrl;

  let reqBody: string | FormData | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && req.body.mode !== 'none') {
    if (req.body.mode === 'formdata' && req.body.raw === undefined) {
      const fd = new FormData();
      for (const f of req.body.fields || []) {
        const k = substituteTemplateVars(f.key, vars);
        const v = substituteTemplateVars(f.value, vars);
        if (f.type === 'file') fd.append(k, new Blob([v], { type: 'application/octet-stream' }), v || 'upload.bin');
        else fd.append(k, v);
      }
      reqBody = fd;
      for (const hk of Object.keys(headers)) {
        if (hk.toLowerCase() === 'content-type' && !headers[hk].includes('boundary=')) delete headers[hk];
      }
    } else if (req.body.mode === 'urlencoded' && req.body.raw === undefined && req.body.fields) {
      reqBody = req.body.fields
        .map((f) => `${encodeURIComponent(substituteTemplateVars(f.key, vars))}=${encodeURIComponent(substituteTemplateVars(f.value, vars))}`)
        .join('&');
      if (!hasHeader('content-type')) headers['Content-Type'] = req.body.contentType || 'application/x-www-form-urlencoded';
    } else {
      if (req.body.raw !== undefined) reqBody = substituteTemplateVars(req.body.raw, vars);
      if (req.body.contentType && !hasHeader('content-type')) headers['Content-Type'] = req.body.contentType;
    }
  }

  const t0 = Date.now();
  const res = await fetch(finalUrl, {
    method: req.method,
    headers,
    body: reqBody,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const bodyText = await res.text();
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { resHeaders[k] = v; });
  return { status: res.status, latencyMs: Date.now() - t0, headers: resHeaders, bodyText };
}
