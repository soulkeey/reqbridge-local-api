import * as vscode from 'vscode';
import { BatchReport, DiffReport, RequestSpec } from '../core/types';

export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: var(--vscode-font-family, system-ui, sans-serif); color: var(--vscode-editor-foreground, #e2e8f0); background: var(--vscode-editor-background, #0f172a); padding: 16px; line-height: 1.5; }
  h1, h2, h3 { margin: 0 0 12px; font-weight: 600; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 16px; }
  .card { border: 1px solid var(--vscode-panel-border, #334155); border-radius: 6px; padding: 10px 14px; min-width: 110px; }
  .label { font-size: 11px; opacity: 0.75; text-transform: uppercase; }
  .val { font-size: 18px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { border: 1px solid var(--vscode-panel-border, #334155); padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: var(--vscode-editorGroupHeader-tabsBackground, #1e293b); }
  .ok { color: #34d399; font-weight: 600; }
  .fail { color: #f87171; font-weight: 600; }
  .warn { color: #fbbf24; font-weight: 600; }
  code, pre { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background, #1e293b); padding: 2px 5px; border-radius: 4px; }
  pre { padding: 10px; overflow-x: auto; white-space: pre-wrap; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function renderSingleResponseHtml(
  req: RequestSpec,
  report: BatchReport,
  responsePreview?: string
): string {
  const row = report.results[0];
  const badge = row?.passed ? '<span class="ok">PASS</span>' : '<span class="fail">FAIL</span>';
  const assertionsHtml = (row?.assertions || [])
    .map(
      (a) =>
        `<tr><td>${a.passed ? '<span class="ok">PASS</span>' : '<span class="fail">FAIL</span>'}</td><td><code>${escapeHtml(a.expression)}</code></td><td>${escapeHtml(a.detail || '')}</td></tr>`
    )
    .join('');

  const body = `
    <h2>${escapeHtml(req.method)} ${escapeHtml(req.name)} — ${badge}</h2>
    <div class="cards">
      <div class="card"><div class="label">Status</div><div class="val">${escapeHtml(row?.status ?? 0)}</div></div>
      <div class="card"><div class="label">Latency</div><div class="val">${escapeHtml(row?.latencyMs ?? 0)} ms</div></div>
      <div class="card"><div class="label">URL</div><div class="val" style="font-size:13px">${escapeHtml(row?.url || req.url)}</div></div>
    </div>
    ${row?.error ? `<p class="fail">Error: ${escapeHtml(row.error)}</p>` : ''}
    <h3>Assertions</h3>
    <table><thead><tr><th>Result</th><th>Expression</th><th>Detail</th></tr></thead><tbody>${assertionsHtml || '<tr><td colspan="3">No assertions</td></tr>'}</tbody></table>
    ${responsePreview ? `<h3>Summary</h3><pre>${escapeHtml(responsePreview)}</pre>` : ''}
  `;
  return wrapHtml(`ReqBridge: ${req.name}`, body);
}

export function renderBatchReportHtml(
  report: BatchReport,
  meta?: { tier: string; remainingRunsToday: number | null }
): string {
  const rowsHtml = report.results
    .slice(0, 200)
    .map(
      (r) => `<tr>
        <td>${r.rowIndex + 1}</td>
        <td>${escapeHtml(r.method)} ${escapeHtml(r.requestName)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.latencyMs)} ms</td>
        <td>${r.passed ? '<span class="ok">PASS</span>' : `<span class="fail">FAIL${r.error ? `: ${escapeHtml(r.error)}` : ''}</span>`}</td>
      </tr>`
    )
    .join('');

  const tierInfo = meta
    ? `<p>Plan: <strong>${escapeHtml(meta.tier.toUpperCase())}</strong>${meta.remainingRunsToday === null ? ' (Unlimited)' : ` · Remaining Free Runs Today: <strong>${escapeHtml(meta.remainingRunsToday)}</strong>`}</p>`
    : '';
  const truncationNotice =
    report.results.length > 200
      ? `<p class="warn">Showing first 200 of ${escapeHtml(report.results.length)} results. Inspect the exported Markdown or JUnit XML report for all rows.</p>`
      : '';

  const body = `
    <h2>ReqBridge CSV/JSON Batch Report</h2>
    ${tierInfo}
    ${truncationNotice}
    <div class="cards">
      <div class="card"><div class="label">Passed</div><div class="val ok">${escapeHtml(report.passedCount)} / ${escapeHtml(report.totalExecutions)}</div></div>
      <div class="card"><div class="label">Failed</div><div class="val ${report.failedCount > 0 ? 'fail' : ''}">${escapeHtml(report.failedCount)}</div></div>
      <div class="card"><div class="label">p50 Latency</div><div class="val">${escapeHtml(report.p50LatencyMs)} ms</div></div>
      <div class="card"><div class="label">p95 Latency</div><div class="val">${escapeHtml(report.p95LatencyMs)} ms</div></div>
    </div>
    <table>
      <thead><tr><th>Row</th><th>Request</th><th>Status</th><th>Latency</th><th>Outcome</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="5">No executions</td></tr>'}</tbody>
    </table>
  `;
  return wrapHtml('ReqBridge Batch Report', body);
}

export function renderDiffReportHtml(reports: DiffReport[]): string {
  const sections = reports
    .map((rep) => {
      const cls = rep.hasBreakingChanges ? 'fail' : rep.entries.some((e) => e.severity === 'warning') ? 'warn' : 'ok';
      const rows = rep.entries
        .map(
          (e) => `<tr>
            <td class="${e.severity === 'breaking' ? 'fail' : e.severity === 'warning' ? 'warn' : 'ok'}">${escapeHtml(e.severity)}</td>
            <td><code>${escapeHtml(e.kind)}</code></td>
            <td><code>${escapeHtml(e.path)}</code></td>
            <td>${escapeHtml(e.message)}</td>
          </tr>`
        )
        .join('');
      return `
        <h3>${escapeHtml(rep.endpoint)} — <span class="${cls}">${escapeHtml(rep.summary)}</span></h3>
        <p>Staging: <code>${escapeHtml(rep.stagingStatus)}</code> · Prod: <code>${escapeHtml(rep.prodStatus)}</code> · Latency Delta: <code>${rep.latencyDeltaMs >= 0 ? '+' : ''}${escapeHtml(rep.latencyDeltaMs)}ms</code></p>
        <table>
          <thead><tr><th>Severity</th><th>Kind</th><th>Path</th><th>Message</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="ok">No structural or status differences</td></tr>'}</tbody>
        </table>
      `;
    })
    .join('<hr/>');

  return wrapHtml('ReqBridge Staging vs Prod Diff', `<h2>Staging vs Prod Schema Diff</h2>${sections}`);
}

export function showReportPanel(
  viewType: string,
  title: string,
  html: string
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    viewType,
    title,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );
  panel.webview.html = html;
  return panel;
}
