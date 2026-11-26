import * as vscode from 'vscode';

const REQUEST_LINE_RE = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i;

export interface HttpBlockLocation {
  blockIndex: number;
  line: number;
  method: string;
  url: string;
}

export function findHttpRequestLines(text: string): HttpBlockLocation[] {
  if (!text || !text.trim()) return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found: HttpBlockLocation[] = [];
  let inBlockHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^###/.test(trimmed)) {
      inBlockHeader = true;
      continue;
    }
    if (!inBlockHeader) continue;
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || /^@[A-Za-z0-9_.-]+\s*=/.test(trimmed)) {
      continue;
    }
    if (REQUEST_LINE_RE.test(trimmed)) {
      const parts = trimmed.split(/\s+/);
      found.push({
        blockIndex: found.length,
        line: i,
        method: parts[0].toUpperCase(),
        url: parts[1],
      });
      inBlockHeader = false;
    }
  }
  return found;
}

export class HttpCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (token?.isCancellationRequested) return [];
    const text = document.getText();
    const locations = findHttpRequestLines(text);
    if (locations.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];
    for (const loc of locations) {
      const range = new vscode.Range(loc.line, 0, loc.line, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: '▶ Send Request',
          command: 'reqbridge.sendRequest',
          arguments: [document.uri, loc.blockIndex],
        }),
        new vscode.CodeLens(range, {
          title: '⇄ Diff Staging vs Prod',
          command: 'reqbridge.diffStagingProd',
          arguments: [document.uri, loc.blockIndex],
        }),
        new vscode.CodeLens(range, {
          title: '📊 Run CSV Batch',
          command: 'reqbridge.runCsvBatch',
          arguments: [document.uri, loc.blockIndex],
        })
      );
    }
    return lenses;
  }
}
