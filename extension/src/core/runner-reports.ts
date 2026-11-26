import { BatchAssertionResult, BatchReport } from './types';

export function escapeMdCell(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

export function getJsonPath(obj: unknown, pathExpr: string): unknown {
  const tokens: string[] = [];
  for (const part of pathExpr.split('.')) {
    if (!part) continue;
    const bracketRe = /([^[\]]+)|\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = bracketRe.exec(part)) !== null) {
      tokens.push(m[1] !== undefined ? m[1] : m[2]);
    }
  }
  if (tokens.length === 0) return undefined;
  let cur: unknown = obj;
  for (const key of tokens) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function splitAndClauses(expr: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let esc = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      cur += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '&' && expr[i + 1] === '&') {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      i++;
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function evaluateClause(
  clause: string,
  status: number,
  bodyText: string,
  getParsed: () => unknown
): { passed: boolean; detail: string } {
  const statusMatch = clause.match(
    /(?:have\.status\(\s*(\d{3})\s*\)|^(?:res\.)?status\s*(?::\s*eq|===?)\s*(\d{3})\s*;?$|(?:getStatus\(\)|res\.status)\)?\.to\.(?:equal|eql)\(\s*(\d{3})\s*\))/i
  );
  if (statusMatch) {
    const expected = Number(statusMatch[1] || statusMatch[2] || statusMatch[3]);
    return { passed: status === expected, detail: `expected ${expected}, got ${status}` };
  }

  const includeMatch = clause.match(
    /(?:to\.include\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\)|(?:^|\s)body\s+contains\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')|res\.body:?\s+contains\s+(?:"((?:\\.|[^"\\])*)"\s*$|'((?:\\.|[^'\\])*)'\s*$|(.+?)\s*$))/i
  );
  if (includeMatch) {
    const rawNeedle = includeMatch[1] ?? includeMatch[2] ?? includeMatch[3] ?? includeMatch[4] ?? includeMatch[5] ?? includeMatch[6];
    const needle = rawNeedle !== undefined ? rawNeedle.replace(/\\(['"\\])/g, '$1') : includeMatch[7];
    const matched = bodyText.includes(needle);
    return { passed: matched, detail: matched ? 'matched' : `missing "${needle}"` };
  }

  const eqMatch = clause.match(
    /^(?:res\.body\.)?([A-Za-z0-9_-]+(?:\[\d+\])*(?:\.[A-Za-z0-9_-]+(?:\[\d+\])*)*)\s*(?::\s*eq|===?)\s*(.+)$/
  );
  if (eqMatch) {
    const pathExpr = eqMatch[1];
    const expectedRaw = eqMatch[2].trim().replace(/^["']|["']$/g, '');
    const actual = getJsonPath(getParsed(), pathExpr);
    const passed = actual !== undefined && String(actual) === expectedRaw;
    return { passed, detail: `${pathExpr}=${String(actual)} (expected ${expectedRaw})` };
  }

  return { passed: false, detail: `unsupported assertion syntax: ${clause}` };
}

export function evaluateAssertions(
  tests: string[],
  status: number,
  bodyText: string
): BatchAssertionResult[] {
  if (tests.length === 0) {
    const passed = status >= 200 && status < 400;
    return [{ expression: 'status in 2xx..3xx', passed, detail: `status=${status}` }];
  }

  let parsedJson: unknown;
  let jsonTried = false;
  const getParsed = (): unknown => {
    if (!jsonTried) {
      jsonTried = true;
      try { parsedJson = JSON.parse(bodyText); } catch { parsedJson = undefined; }
    }
    return parsedJson;
  };

  const results: BatchAssertionResult[] = [];
  for (const expr of tests) {
    const clauses = splitAndClauses(expr.trim());
    if (clauses.length === 0) {
      results.push({ expression: expr, passed: false, detail: 'unsupported assertion syntax: empty' });
      continue;
    }
    const evaluated = clauses.map((c) => evaluateClause(c, status, bodyText, getParsed));
    const failed = evaluated.filter((r) => !r.passed);
    results.push({
      expression: expr,
      passed: failed.length === 0,
      detail: failed.length === 0 ? evaluated.map((r) => r.detail).join('; ') : failed.map((r) => r.detail).join('; '),
    });
  }
  return results;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function computePercentile(sortedLatencies: number[], p: number): number {
  if (sortedLatencies.length === 0) return 0;
  const idx = Math.min(
    sortedLatencies.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedLatencies.length) - 1)
  );
  return sortedLatencies[idx];
}

export function exportJUnitXml(report: BatchReport): string {
  const totalTimeSec = (report.durationMs / 1000).toFixed(3);
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="ReqBridge Local Batch" tests="${report.totalExecutions}" failures="${report.failedCount}" time="${totalTimeSec}">`,
  ];

  for (const r of report.results) {
    const caseName = escapeXml(`[row ${r.rowIndex + 1}] ${r.method} ${r.requestName}`);
    const className = escapeXml(r.requestId);
    const timeSec = (r.latencyMs / 1000).toFixed(3);
    if (r.passed) {
      lines.push(`  <testcase name="${caseName}" classname="${className}" time="${timeSec}" />`);
    } else {
      const failReasons = [
        ...(r.error ? [r.error] : []),
        ...r.assertions.filter((a) => !a.passed).map((a) => `${a.expression} (${a.detail || 'failed'})`),
      ];
      const msg = escapeXml(failReasons.join('; ') || `HTTP status ${r.status}`);
      lines.push(`  <testcase name="${caseName}" classname="${className}" time="${timeSec}">`);
      lines.push(`    <failure message="${msg}">${msg}</failure>`);
      lines.push('  </testcase>');
    }
  }

  lines.push('</testsuite>');
  return lines.join('\n') + '\n';
}

export function exportBatchMarkdown(report: BatchReport): string {
  const lines: string[] = [
    '## ReqBridge Local Batch Report',
    '',
    `- **Executions:** ${report.totalExecutions} (${report.totalRows} rows × ${report.totalRequests} requests)`,
    `- **Passed / Failed:** ${report.passedCount} passed · ${report.failedCount} failed`,
    `- **Latency:** min \`${report.minLatencyMs}ms\` · p50 \`${report.p50LatencyMs}ms\` · p95 \`${report.p95LatencyMs}ms\` · max \`${report.maxLatencyMs}ms\``,
    `- **Total Duration:** \`${report.durationMs}ms\``,
    '',
  ];

  const failures = report.results.filter((r) => !r.passed);
  if (failures.length === 0) {
    lines.push('All batch assertions passed.');
  } else {
    lines.push('### Failures', '');
    lines.push('| Row | Request | Status | Detail |');
    lines.push('|---:|---|---:|---|');
    for (const f of failures.slice(0, 50)) {
      const detail =
        f.error ||
        f.assertions
          .filter((a) => !a.passed)
          .map((a) => `${a.expression}${a.detail ? ` (${a.detail})` : ''}`)
          .join('; ') ||
        'Request failed';
      const safeName = escapeMdCell(f.requestName);
      lines.push(`| ${f.rowIndex + 1} | ${escapeMdCell(f.method)} ${safeName} | ${f.status} | ${escapeMdCell(detail)} |`);
    }
  }
  return lines.join('\n') + '\n';
}
