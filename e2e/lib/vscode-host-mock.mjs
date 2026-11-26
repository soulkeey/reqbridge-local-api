import fs from 'node:fs';
import Module, { builtinModules } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const BUILTIN_SET = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => (m.startsWith('node:') ? m.slice(5) : `node:${m}`)),
]);

class MockEventEmitter {
  constructor() {
    this._listeners = new Set();
    this.event = (listener, thisArgs) => {
      const fn = thisArgs ? listener.bind(thisArgs) : listener;
      this._listeners.add(fn);
      return { dispose: () => this._listeners.delete(fn) };
    };
  }
  fire(data) {
    for (const fn of [...this._listeners]) fn(data);
  }
  dispose() {
    this._listeners.clear();
  }
}

class MockPosition {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class MockRange {
  constructor(startLine, startChar, endLine, endChar) {
    if (startLine instanceof MockPosition) {
      this.start = startLine;
      this.end = startChar;
    } else {
      this.start = new MockPosition(startLine, startChar);
      this.end = new MockPosition(endLine ?? startLine, endChar ?? startChar);
    }
  }
}

class MockCodeLens {
  constructor(range, command) {
    this.range = range;
    this.command = command;
    this.isResolved = Boolean(command);
  }
}

class MockUri {
  constructor(scheme, fsPath) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath.replace(/\\/g, '/');
  }
  toString() {
    return `${this.scheme}://${this.path}`;
  }
  static file(p) {
    return new MockUri('file', path.resolve(p));
  }
  static parse(s) {
    const idx = String(s).indexOf('://');
    if (idx === -1) return new MockUri('file', String(s));
    return new MockUri(s.slice(0, idx), s.slice(idx + 3));
  }
  static joinPath(base, ...segments) {
    return new MockUri(base.scheme || 'file', path.join(base.fsPath || base.path, ...segments));
  }
}

export function createMockTextDocument(text, fileName = 'sample.http', languageId = 'http') {
  const lines = String(text).split(/\r?\n/);
  return {
    uri: MockUri.file(fileName),
    fileName,
    languageId,
    version: 1,
    lineCount: lines.length,
    getText() {
      return String(text);
    },
    lineAt(lineOrPos) {
      const line = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
      const lineText = lines[line] ?? '';
      return {
        lineNumber: line,
        text: lineText,
        range: new MockRange(line, 0, line, lineText.length),
      };
    },
    positionAt(offset) {
      const prefix = String(text).slice(0, offset);
      const split = prefix.split(/\r?\n/);
      return new MockPosition(split.length - 1, split[split.length - 1].length);
    },
  };
}

export function createVscodeMock(opts = {}) {
  const registeredCommands = new Map();
  const codeLensProviders = [];
  const messages = [];
  const webviews = [];
  const outputChannels = [];
  const configValues = new Map(Object.entries(opts.config || {}));
  let clipboardText = '';
  let inputBoxQueue = [...(opts.inputResponses || [])];
  let quickPickQueue = [...(opts.quickPickResponses || [])];

  const secretStore = new Map(Object.entries(opts.initialSecrets || {}));
  const secretEmitter = new MockEventEmitter();
  const secrets = {
    async get(key) {
      return secretStore.get(key);
    },
    async store(key, value) {
      secretStore.set(key, String(value));
      secretEmitter.fire({ key });
    },
    async delete(key) {
      secretStore.delete(key);
      secretEmitter.fire({ key });
    },
    onDidChange: secretEmitter.event,
    _dump() {
      return Object.fromEntries(secretStore.entries());
    },
  };

  function createMemento(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
      get(key, defaultValue) {
        return map.has(key) ? map.get(key) : defaultValue;
      },
      async update(key, value) {
        if (value === undefined) map.delete(key);
        else map.set(key, value);
      },
      keys() {
        return [...map.keys()];
      },
      _dump() {
        return Object.fromEntries(map.entries());
      },
    };
  }

  const context = {
    subscriptions: [],
    secrets,
    globalState: createMemento(opts.initialGlobalState || {}),
    workspaceState: createMemento(opts.initialWorkspaceState || {}),
    extensionPath: opts.extensionPath || process.cwd(),
    extensionUri: MockUri.file(opts.extensionPath || process.cwd()),
    globalStorageUri: MockUri.file(path.join(opts.extensionPath || process.cwd(), '.global-storage')),
    storageUri: MockUri.file(path.join(opts.extensionPath || process.cwd(), '.workspace-storage')),
    extensionMode: 2,
  };

  const vscode = {
    Uri: MockUri,
    Range: MockRange,
    Position: MockPosition,
    CodeLens: MockCodeLens,
    EventEmitter: MockEventEmitter,
    ViewColumn: { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    env: {
      machineId: opts.machineId || 'e2e-vscode-machine-001',
      appName: 'Visual Studio Code',
      language: 'en',
      clipboard: {
        async writeText(t) {
          clipboardText = String(t);
        },
        async readText() {
          return clipboardText;
        },
      },
      async openExternal() {
        return true;
      },
    },
    commands: {
      registerCommand(id, handler) {
        registeredCommands.set(id, handler);
        return {
          dispose() {
            registeredCommands.delete(id);
          },
        };
      },
      async executeCommand(id, ...args) {
        const fn = registeredCommands.get(id);
        if (!fn) throw new Error(`Mock command not registered: ${id}`);
        return await fn(...args);
      },
      async getCommands() {
        return [...registeredCommands.keys()];
      },
    },
    languages: {
      registerCodeLensProvider(selector, provider) {
        const entry = { selector, provider };
        codeLensProviders.push(entry);
        return {
          dispose() {
            const idx = codeLensProviders.indexOf(entry);
            if (idx >= 0) codeLensProviders.splice(idx, 1);
          },
        };
      },
    },
    window: {
      activeTextEditor: opts.activeTextEditor || null,
      showInformationMessage(msg, ...items) {
        messages.push({ level: 'info', msg, items });
        return Promise.resolve(items[0]);
      },
      showWarningMessage(msg, ...items) {
        messages.push({ level: 'warn', msg, items });
        return Promise.resolve(items[0]);
      },
      showErrorMessage(msg, ...items) {
        messages.push({ level: 'error', msg, items });
        return Promise.resolve(items[0]);
      },
      async showInputBox() {
        return inputBoxQueue.length ? inputBoxQueue.shift() : opts.defaultInputBox;
      },
      async showQuickPick(items) {
        if (quickPickQueue.length) return quickPickQueue.shift();
        return Array.isArray(items) ? items[0] : undefined;
      },
      async showSaveDialog() {
        return opts.defaultSaveUri || undefined;
      },
      async showOpenDialog() {
        return opts.defaultOpenUris || undefined;
      },
      async withProgress(_options, task) {
        return await task({ report() {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) });
      },
      createOutputChannel(name) {
        const lines = [];
        const ch = {
          name,
          lines,
          append(s) {
            lines.push(String(s));
          },
          appendLine(s) {
            lines.push(String(s));
          },
          clear() {
            lines.length = 0;
          },
          show() {},
          dispose() {},
        };
        outputChannels.push(ch);
        return ch;
      },
      createWebviewPanel(viewType, title, showOptions, options) {
        const panel = {
          viewType,
          title,
          showOptions,
          options,
          webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }), async postMessage() { return true; } },
          onDidDispose: () => ({ dispose() {} }),
          reveal() {},
          dispose() {},
        };
        webviews.push(panel);
        return panel;
      },
      createStatusBarItem() {
        return { text: '', tooltip: '', command: '', show() {}, hide() {}, dispose() {} };
      },
    },
    workspace: {
      workspaceFolders: opts.workspaceFolders || [],
      getConfiguration(section = '') {
        return {
          get(key, defaultValue) {
            const fullKey = section ? `${section}.${key}` : key;
            return configValues.has(fullKey) ? configValues.get(fullKey) : defaultValue;
          },
          async update(key, value) {
            const fullKey = section ? `${section}.${key}` : key;
            configValues.set(fullKey, value);
          },
        };
      },
      async openTextDocument(arg) {
        if (typeof arg === 'string') {
          return createMockTextDocument(fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : '', arg);
        }
        if (arg && typeof arg === 'object' && typeof arg.content === 'string') {
          return createMockTextDocument(arg.content, 'untitled.http', arg.language || 'http');
        }
        return createMockTextDocument('', 'untitled.http');
      },
      onDidChangeTextDocument: () => ({ dispose() {} }),
    },
  };

  return {
    vscode,
    context,
    registeredCommands,
    codeLensProviders,
    messages,
    webviews,
    outputChannels,
    setActiveTextEditor(doc) {
      vscode.window.activeTextEditor = doc ? { document: doc } : null;
    },
    disposeSubscriptions() {
      for (const sub of [...context.subscriptions]) {
        if (sub && typeof sub.dispose === 'function') {
          sub.dispose();
        }
      }
      context.subscriptions.length = 0;
    },
  };
}

/**
 * Loads a CJS extension bundle (from disk path or in-memory source string) while
 * intercepting Module._load for 'vscode' and rejecting unexpected third-party requires.
 *
 * @param {{ filePath?: string; code?: string; virtualFilename?: string; vscodeOpts?: any }} target
 */
export function loadExtensionWithMockHost(target) {
  const code = target.code ?? fs.readFileSync(target.filePath, 'utf8');
  const filename = target.virtualFilename || target.filePath || path.join(process.cwd(), 'extension.js');

  // Step 1: Validate JavaScript syntax cleanly via node:vm
  new vm.Script(code, { filename });

  const host = createVscodeMock({
    extensionPath: path.dirname(filename),
    ...(target.vscodeOpts || {}),
  });

  const requiredModules = [];
  const unexpectedRequires = [];
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    requiredModules.push(request);
    if (request === 'vscode') {
      return host.vscode;
    }
    if (BUILTIN_SET.has(request)) {
      return originalLoad.call(this, request, parent, isMain);
    }
    if (request.startsWith('./') || request.startsWith('../') || path.isAbsolute(request)) {
      return originalLoad.call(this, request, parent, isMain);
    }
    unexpectedRequires.push(request);
    const err = new Error(`Unexpected third-party require("${request}") in extension bundle.`);
    err.code = 'UNEXPECTED_EXTENSION_REQUIRE';
    throw err;
  };

  let exportsObj;
  try {
    const mod = new Module(filename, null);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod._compile(code, filename);
    exportsObj = mod.exports;
  } finally {
    Module._load = originalLoad;
  }

  return {
    exports: exportsObj,
    host,
    requiredModules,
    unexpectedRequires,
  };
}
