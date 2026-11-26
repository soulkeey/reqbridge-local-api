import * as vscode from 'vscode';
import { HttpCodeLensProvider } from './codelens';
import { registerReqBridgeCommands } from './commands';
import { ReqBridgeTreeProvider } from './explorer';
import { hydrateStartupLicense } from './license-store';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('ReqBridge Local API');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.show();

  const codeLensProvider = new HttpCodeLensProvider();
  const codeLensReg = vscode.languages.registerCodeLensProvider(
    [
      { language: 'http' },
      { language: 'rest' },
      { pattern: '**/*.http' },
      { pattern: '**/*.rest' },
    ],
    codeLensProvider
  );

  const explorerProvider = new ReqBridgeTreeProvider();
  const explorerReg =
    typeof vscode.window.registerTreeDataProvider === 'function'
      ? vscode.window.registerTreeDataProvider('reqbridgeExplorer', explorerProvider)
      : { dispose() {} };

  const changeDocSub = vscode.workspace.onDidChangeTextDocument((event) => {
    const lang = event?.document?.languageId;
    if (lang === 'http' || lang === 'rest') {
      codeLensProvider.refresh();
      explorerProvider.refresh();
    }
  });

  const commandDisposables = registerReqBridgeCommands(context, output, statusBar);

  context.subscriptions.push(
    output,
    statusBar,
    codeLensProvider,
    codeLensReg,
    explorerProvider,
    explorerReg,
    changeDocSub,
    ...commandDisposables
  );

  await hydrateStartupLicense(context, statusBar);
}

export function deactivate(): void {
  // Disposables pushed to context.subscriptions are cleaned up automatically by VS Code.
}
