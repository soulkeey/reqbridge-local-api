import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PUBLIC_KEY_PEM } from '../src/core/license';

function createMockVscodeEnv(opts?: {
  machineId?: string;
  initialSecrets?: Record<string, string>;
  inputQueue?: Array<string | undefined>;
  quickPickQueue?: Array<string | undefined>;
}) {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const codeLensProviders: Array<{ selector: unknown; provider: { provideCodeLenses: (d: unknown, t: unknown) => unknown } }> = [];
  const webviews: Array<{ title: string; webview: { html: string } }> = [];
  const messages: Array<{ level: string; msg: string }> = [];
  const secretsMap = new Map<string, string>(Object.entries(opts?.initialSecrets || {}));
  const globalMap = new Map<string, unknown>();
  const inputQueue = [...(opts?.inputQueue || [])];
  const quickPickQueue = [...(opts?.quickPickQueue || [])];
  const statusBarItem = { text: '', tooltip: '', command: '', show() {}, hide() {}, dispose() {} };
  const cfgMap = new Map<string, unknown>();

  const makeDoc = (text: string, fileName = 'test.http', languageId = 'http') => {
    const lines = text.split(/\r?\n/);
    return {
      uri: { scheme: 'file', fsPath: fileName, path: fileName.replace(/\\/g, '/') },
      fileName,
      languageId,
      lineCount: lines.length,
      getText: () => text,
      lineAt: (n: number) => ({ lineNumber: n, text: lines[n] ?? '' }),
    };
  };

  const vscode = {
    Uri: {
      file: (p: string) => ({ scheme: 'file', fsPath: path.resolve(p), path: path.resolve(p).replace(/\\/g, '/') }),
      parse: (s: string) => ({ scheme: 'https', fsPath: s, path: s }),
    },
    Position: class { constructor(public line: number, public character: number) {} },
    Range: class {
      start: { line: number; character: number };
      end: { line: number; character: number };
      constructor(a: number, b: number, c: number, d: number) {
        this.start = { line: a, character: b };
        this.end = { line: c, character: d };
      }
    },
    CodeLens: class { constructor(public range: unknown, public command?: unknown) {} },
    EventEmitter: class {
      private listeners = new Set<(...args: unknown[]) => void>();
      event = (fn: (...args: unknown[]) => void) => { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; };
      fire = (d?: unknown) => { for (const fn of this.listeners) fn(d); };
      dispose = () => this.listeners.clear();
    },
    ViewColumn: { Beside: -2 },
    StatusBarAlignment: { Right: 2 },
    ProgressLocation: { Notification: 15 },
    env: {
      machineId: opts?.machineId || 'host-test-machine-01',
      openExternal: async () => true,
    },
    commands: {
      registerCommand: (id: string, fn: (...args: unknown[]) => unknown) => {
        commands.set(id, fn);
        return { dispose: () => commands.delete(id) };
      },
      executeCommand: async (id: string, ...args: unknown[]) => {
        const fn = commands.get(id);
        if (!fn) throw new Error(`Missing command: ${id}`);
        return await fn(...args);
      },
    },
    languages: {
      registerCodeLensProvider: (selector: unknown, provider: { provideCodeLenses: (d: unknown, t: unknown) => unknown }) => {
        const entry = { selector, provider };
        codeLensProviders.push(entry);
        return { dispose: () => {} };
      },
    },
    window: {
      activeTextEditor: null as { document: ReturnType<typeof makeDoc> } | null,
      createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
      createStatusBarItem: () => statusBarItem,
      createWebviewPanel: (_vt: string, title: string) => {
        const panel = { title, webview: { html: '' } };
        webviews.push(panel);
        return panel;
      },
      withProgress: async (_o: unknown, task: () => Promise<unknown>) => await task(),
      showInformationMessage: async (msg: string) => { messages.push({ level: 'info', msg }); return undefined; },
      showWarningMessage: async (msg: string) => { messages.push({ level: 'warn', msg }); return undefined; },
      showErrorMessage: async (msg: string) => { messages.push({ level: 'error', msg }); return undefined; },
      showInputBox: async () => inputQueue.shift(),
      showQuickPick: async (items: string[]) => (quickPickQueue.length ? quickPickQueue.shift() : items[0]),
      showOpenDialog: async () => undefined,
      showSaveDialog: async () => undefined,
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: (sec = '') => ({
        get: (k: string, def?: unknown) => (cfgMap.has(`${sec}.${k}`) ? cfgMap.get(`${sec}.${k}`) : def),
      }),
      openTextDocument: async (arg: { content?: string; language?: string }) => makeDoc(arg?.content || '', 'untitled', arg?.language || 'text'),
      onDidChangeTextDocument: () => ({ dispose: () => {} }),
    },
  };

  const context = {
    subscriptions: [] as Array<{ dispose?: () => void }>,
    secrets: {
      get: async (k: string) => secretsMap.get(k),
      store: async (k: string, v: string) => { secretsMap.set(k, v); },
      delete: async (k: string) => { secretsMap.delete(k); },
    },
    globalState: {
      get: (k: string, def?: unknown) => (globalMap.has(k) ? globalMap.get(k) : def),
      update: async (k: string, v: unknown) => { if (v === undefined) globalMap.delete(k); else globalMap.set(k, v); },
    },
  };

  return { vscode, context, commands, codeLensProviders, webviews, messages, statusBarItem, makeDoc, cfgMap, secretsMap };
}

function withMockedVscode<T>(mockVscode: unknown, fn: () => T): T {
  const modAny = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown };
  const origLoad = modAny._load;
  const vscodeDir = path.resolve(__dirname, '..', 'src', 'vscode');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(vscodeDir)) delete require.cache[key];
  }
  modAny._load = function (req: string, parent: unknown, isMain: boolean) {
    if (req === 'vscode') return mockVscode;
    return origLoad.call(this, req, parent, isMain);
  };
  try {
    return fn();
  } finally {
    modAny._load = origLoad;
  }
}

describe('VS Code Extension Host Integration', () => {
  it('activates, registers all 8 commands, provides CodeLens on .http, and escapes Webview HTML with CSP', async () => {
    const env = createMockVscodeEnv();
    const extPath = path.resolve(__dirname, '..', 'src', 'vscode', 'extension.js');
    const webviewPath = path.resolve(__dirname, '..', 'src', 'vscode', 'webview.js');

    const extMod = withMockedVscode(env.vscode, () => {
      delete require.cache[extPath];
      delete require.cache[webviewPath];
      return require(extPath) as { activate: (ctx: unknown) => Promise<void>; deactivate: () => void };
    });
    const webviewMod = withMockedVscode(env.vscode, () => require(webviewPath) as {
      escapeHtml: (s: string) => string;
      renderSingleResponseHtml: (req: unknown, rep: unknown) => string;
    });

    await extMod.activate(env.context);
    assert.equal(env.statusBarItem.text, 'ReqBridge: Free');
    assert.ok(env.context.subscriptions.length >= 10);
    for (const id of [
      'reqbridge.importCollection',
      'reqbridge.exportOpenApi',
      'reqbridge.sendRequest',
      'reqbridge.runCsvBatch',
      'reqbridge.diffStagingProd',
      'reqbridge.exportCiBundle',
      'reqbridge.activateLicense',
      'reqbridge.translateScriptByok',
    ]) {
      assert.ok(env.commands.has(id), `Expected command ${id}`);
    }

    const provider = env.codeLensProviders[0].provider;
    const validDoc = env.makeDoc('### Ping\nGET https://api.example.com/ping\n\n### Create\nPOST https://api.example.com/items\n');
    const lenses = provider.provideCodeLenses(validDoc, { isCancellationRequested: false }) as Array<{ command: { command: string } }>;
    assert.equal(lenses.length, 6);
    assert.deepEqual(provider.provideCodeLenses(env.makeDoc('   \nnot http\n###\n'), { isCancellationRequested: false }), []);

    const html = webviewMod.renderSingleResponseHtml(
      { name: '<script>alert(1)</script>', method: 'GET', url: 'https://x.test' },
      { results: [{ rowIndex: 0, requestId: '1', requestName: 'x', method: 'GET', url: 'https://x.test', status: 200, latencyMs: 12, passed: true, assertions: [] }] }
    );
    assert.ok(html.includes("default-src 'none'; style-src 'unsafe-inline';"));
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

    for (const s of env.context.subscriptions) s.dispose?.();
    extMod.deactivate();
  });

  it('executes importCollection, sendRequest, runCsvBatch (with Free vs Pro gating), diffStagingProd, and exportCiBundle', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqbridge-vs-'));
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/staging/items')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: '1', extraField: true }));
        return;
      }
      if (req.url?.startsWith('/prod/items')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 1 }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const postmanPath = path.join(tmpDir, 'orders.postman.json');
      await fs.writeFile(
        postmanPath,
        JSON.stringify({
          info: { name: 'Local Orders' },
          variable: [{ key: 'baseUrl', value: baseUrl }],
          item: [{ name: 'Create', request: { method: 'POST', url: '{{baseUrl}}/orders' }, event: [{ listen: 'test', script: { exec: ['pm.response.to.have.status(201);'] } }] }],
        }),
        'utf8'
      );

      const env = createMockVscodeEnv({ inputQueue: [`${baseUrl}/staging`, `${baseUrl}/prod`] });
      const extPath = path.resolve(__dirname, '..', 'src', 'vscode', 'extension.js');
      const extMod = withMockedVscode(env.vscode, () => {
        delete require.cache[extPath];
        return require(extPath) as { activate: (ctx: unknown) => Promise<void> };
      });
      await extMod.activate(env.context);

      // 1. Import Postman -> .http + .env.example + .openapi.yaml
      await env.vscode.commands.executeCommand('reqbridge.importCollection', env.vscode.Uri.file(postmanPath));
      const httpPath = path.join(tmpDir, 'orders.postman.http');
      const httpText = await fs.readFile(httpPath, 'utf8');
      assert.ok(httpText.includes('POST {{baseUrl}}/orders'));

      // 2. Send single request
      await env.vscode.commands.executeCommand('reqbridge.sendRequest', env.vscode.Uri.file(httpPath), 0);
      assert.ok(env.webviews.some((w) => w.webview.html.includes('PASS')));

      // 3. Free CSV batch > 10 rows blocked, <= 10 allowed
      const bigCsv = 'orderId\n' + Array.from({ length: 12 }, (_, i) => `ord_${i}`).join('\n') + '\n';
      const csvPath = path.join(tmpDir, 'orders.postman.csv');
      await fs.writeFile(csvPath, bigCsv, 'utf8');
      await env.vscode.commands.executeCommand('reqbridge.runCsvBatch', env.vscode.Uri.file(httpPath), 0);
      assert.ok(env.messages.some((m) => m.level === 'warn' && /Free Core supports up to 10 CSV rows/i.test(m.msg)));

      // 4. Free CI export blocked
      await env.vscode.commands.executeCommand('reqbridge.exportCiBundle', env.vscode.Uri.file(httpPath));
      assert.ok(env.messages.some((m) => m.level === 'warn' && /Pro/i.test(m.msg)));

      // 5. Diff Staging vs Prod
      const diffHttpPath = path.join(tmpDir, 'diff.http');
      await fs.writeFile(diffHttpPath, '### Items\nGET {{baseUrl}}/items\n', 'utf8');
      await env.vscode.commands.executeCommand('reqbridge.diffStagingProd', env.vscode.Uri.file(diffHttpPath), 0);
      assert.ok(env.webviews.some((w) => w.webview.html.includes('type_shift')));

      // 6. Pro license check via license-store with ephemeral Ed25519 test key
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const machineHash = crypto.createHash('sha256').update(env.vscode.env.machineId).digest('hex');
      const payloadB64 = Buffer.from(JSON.stringify({ v: 1, plan: 'personal', seats: 1, maxDevices: 3, id: 'lic_test', iat: '2026-01-01T00:00:00Z', machineLock: machineHash })).toString('base64url');
      const sigB64 = crypto.sign(null, Buffer.from(`RB1.${payloadB64}`), privateKey).toString('base64url');
      const licenseStorePath = path.resolve(__dirname, '..', 'src', 'vscode', 'license-store.js');
      const licenseStore = withMockedVscode(env.vscode, () => require(licenseStorePath) as {
        activateAndSaveLicense: (c: unknown, k: string, b: unknown, o: { publicKeyPem: string }) => Promise<{ valid: boolean; tier: string }>;
      });
      const proStatus = await licenseStore.activateAndSaveLicense(env.context, `RB1.${payloadB64}.${sigB64}`, env.statusBarItem, { publicKeyPem: pubPem });
      assert.equal(proStatus.valid, true);
      assert.equal(env.statusBarItem.text, 'ReqBridge: Pro (Personal)');
      assert.ok(DEFAULT_PUBLIC_KEY_PEM.includes('BEGIN PUBLIC KEY'));
    } finally {
      server.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
