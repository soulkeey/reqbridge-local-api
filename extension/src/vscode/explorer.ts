import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { parseInputCollection } from '../core/parsers';

interface ExplorerNode {
  id: string;
  label: string;
  description?: string;
  collapsibleState: number;
  command?: { command: string; title: string; arguments?: unknown[] };
  children?: ExplorerNode[];
}

async function findHttpFiles(rootDir: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'out-test' || ent.name === 'dist') continue;
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) out.push(...(await findHttpFiles(full, depth + 1)));
    else if (ent.isFile() && /\.(?:http|rest)$/i.test(ent.name)) out.push(full);
    if (out.length >= 25) break;
  }
  return out;
}

export class ReqBridgeTreeProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private readonly emitter = new vscode.EventEmitter<ExplorerNode | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: ExplorerNode): vscode.TreeItem {
    return {
      label: element.label,
      description: element.description,
      collapsibleState: element.collapsibleState,
      command: element.command,
    };
  }

  async getChildren(element?: ExplorerNode): Promise<ExplorerNode[]> {
    if (element) return element.children || [];
    const items: ExplorerNode[] = [
      {
        id: 'act-import',
        label: 'Import Collection / OpenAPI -> .http',
        description: 'Postman / Thunder / Bruno / OpenAPI',
        collapsibleState: 0,
        command: { command: 'reqbridge.importCollection', title: 'Import Collection' },
      },
      {
        id: 'act-curl',
        label: 'Import cURL Command -> .http',
        description: 'Paste curl ...',
        collapsibleState: 0,
        command: { command: 'reqbridge.importCurl', title: 'Import cURL' },
      },
      {
        id: 'act-thunder',
        label: 'Auto-Discover Thunder Client',
        description: 'Scan local workspace & VS Code storage',
        collapsibleState: 0,
        command: { command: 'reqbridge.autoDiscoverThunder', title: 'Auto-Discover Thunder' },
      },
    ];

    for (const folder of vscode.workspace.workspaceFolders || []) {
      const files = await findHttpFiles(folder.uri.fsPath);
      for (const fp of files) {
        const rel = path.relative(folder.uri.fsPath, fp);
        let children: ExplorerNode[] = [];
        try {
          const text = await fs.readFile(fp, 'utf8');
          const col = parseInputCollection(text, 'http');
          children = col.requests.map((req, idx) => ({
            id: `${fp}#${idx}`,
            label: `${req.method} ${req.name}`,
            description: req.url,
            collapsibleState: 0,
            command: { command: 'reqbridge.sendRequest', title: 'Send Request', arguments: [vscode.Uri.file(fp), idx] },
          }));
        } catch {
          children = [];
        }
        items.push({
          id: fp,
          label: rel,
          description: `${children.length} req(s)`,
          collapsibleState: children.length > 0 ? 1 : 0,
          children,
        });
      }
    }
    return items;
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
