import { DiffEntry, DiffReport, DiffSeverity, ResponseSample } from './types';

function jsonTypeOf(val: unknown): string {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function compareJsonValues(
  path: string,
  stagingVal: unknown,
  prodVal: unknown,
  entries: DiffEntry[]
): void {
  const sType = jsonTypeOf(stagingVal);
  const pType = jsonTypeOf(prodVal);

  if (sType !== pType) {
    entries.push({
      kind: 'type_shift',
      severity: 'breaking',
      path,
      message: `Type changed from ${pType} (prod) to ${sType} (staging)`,
      stagingValue: stagingVal,
      prodValue: prodVal,
    });
    return;
  }

  if (sType === 'object') {
    const sObj = stagingVal as Record<string, unknown>;
    const pObj = prodVal as Record<string, unknown>;
    for (const key of Object.keys(pObj)) {
      const childPath = `${path}.${key}`;
      if (!Object.prototype.hasOwnProperty.call(sObj, key)) {
        entries.push({
          kind: 'missing_key',
          severity: 'breaking',
          path: childPath,
          message: `Key '${childPath}' present in prod is missing in staging`,
          prodValue: pObj[key],
        });
      } else {
        compareJsonValues(childPath, sObj[key], pObj[key], entries);
      }
    }
    for (const key of Object.keys(sObj)) {
      if (!Object.prototype.hasOwnProperty.call(pObj, key)) {
        const childPath = `${path}.${key}`;
        entries.push({
          kind: 'added_key',
          severity: 'non-breaking',
          path: childPath,
          message: `Additive key '${childPath}' introduced in staging`,
          stagingValue: sObj[key],
        });
      }
    }
    return;
  }

  if (sType === 'array') {
    const sArr = stagingVal as unknown[];
    const pArr = prodVal as unknown[];
    if (sArr.length !== pArr.length) {
      entries.push({
        kind: 'value_mismatch',
        severity: 'info',
        path: `${path}.length`,
        message: `Array length changed from ${pArr.length} (prod) to ${sArr.length} (staging)`,
        stagingValue: sArr.length,
        prodValue: pArr.length,
      });
    }
    const minLen = Math.min(sArr.length, pArr.length);
    for (let i = 0; i < minLen; i++) {
      compareJsonValues(`${path}[${i}]`, sArr[i], pArr[i], entries);
    }
    return;
  }

  if (stagingVal !== prodVal) {
    entries.push({
      kind: 'value_mismatch',
      severity: 'info',
      path,
      message: `Value changed from ${JSON.stringify(prodVal)} to ${JSON.stringify(stagingVal)}`,
      stagingValue: stagingVal,
      prodValue: prodVal,
    });
  }
}

function resolveBodyJson(
  sample: ResponseSample,
  label: string,
  entries: DiffEntry[]
): { parsed: unknown; ok: boolean } {
  if (sample.bodyJson !== undefined) return { parsed: sample.bodyJson, ok: true };
  const trimmed = sample.bodyText.trim();
  if (!trimmed) return { parsed: undefined, ok: false };
  try {
    return { parsed: JSON.parse(trimmed), ok: true };
  } catch (err) {
    entries.push({
      kind: 'body_parse_error',
      severity: 'warning',
      path: '$',
      message: `${label} response body is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    });
    return { parsed: undefined, ok: false };
  }
}

export function diffResponses(
  endpoint: string,
  staging: ResponseSample,
  prod: ResponseSample
): DiffReport {
  const entries: DiffEntry[] = [];
  const statusMatch = staging.status === prod.status;

  if (!statusMatch) {
    const severity: DiffSeverity = staging.status >= 400 || prod.status >= 400 ? 'breaking' : 'warning';
    entries.push({
      kind: 'status_drift',
      severity,
      path: '$status',
      message: `HTTP status drifted: staging=${staging.status} vs prod=${prod.status}`,
      stagingValue: staging.status,
      prodValue: prod.status,
    });
  }

  const latencyDeltaMs = staging.latencyMs - prod.latencyMs;
  const isSlowRegression =
    Math.abs(latencyDeltaMs) > 150 || (prod.latencyMs > 0 && staging.latencyMs > prod.latencyMs * 2);
  if (isSlowRegression) {
    entries.push({
      kind: 'latency_delta',
      severity: 'warning',
      path: '$latencyMs',
      message: `Latency shifted by ${latencyDeltaMs >= 0 ? '+' : ''}${latencyDeltaMs}ms (${prod.latencyMs}ms -> ${staging.latencyMs}ms)`,
      stagingValue: staging.latencyMs,
      prodValue: prod.latencyMs,
    });
  } else if (latencyDeltaMs !== 0) {
    entries.push({
      kind: 'latency_delta',
      severity: 'info',
      path: '$latencyMs',
      message: `Latency delta ${latencyDeltaMs >= 0 ? '+' : ''}${latencyDeltaMs}ms`,
      stagingValue: staging.latencyMs,
      prodValue: prod.latencyMs,
    });
  }

  const sJson = resolveBodyJson(staging, 'Staging', entries);
  const pJson = resolveBodyJson(prod, 'Production', entries);
  const sEmpty = staging.bodyJson === undefined && staging.bodyText.trim() === '';
  const pEmpty = prod.bodyJson === undefined && prod.bodyText.trim() === '';
  if (sJson.ok && pJson.ok) {
    compareJsonValues('$', sJson.parsed, pJson.parsed, entries);
  } else if (sEmpty !== pEmpty) {
    entries.push({
      kind: !sEmpty && sJson.ok ? 'type_shift' : 'body_parse_error',
      severity: 'breaking',
      path: sJson.ok || pJson.ok ? '$' : '$bodyText',
      message: sEmpty
        ? `Staging response body is empty while Production returned ${pJson.ok ? 'JSON' : 'non-empty body'}`
        : `Production response body is empty while Staging returned ${sJson.ok ? 'JSON' : 'non-empty body'}`,
      stagingValue: sEmpty ? '' : (sJson.ok ? sJson.parsed : staging.bodyText),
      prodValue: pEmpty ? '' : (pJson.ok ? pJson.parsed : prod.bodyText),
    });
  } else if (!sJson.ok && !pJson.ok && staging.bodyText !== prod.bodyText) {
    entries.push({
      kind: 'value_mismatch',
      severity: 'info',
      path: '$bodyText',
      message: 'Raw text response body differs between staging and prod',
    });
  }

  const breakingCount = entries.filter((e) => e.severity === 'breaking').length;
  const warningCount = entries.filter((e) => e.severity === 'warning').length;
  const hasBreakingChanges = breakingCount > 0;

  let summary: string;
  if (hasBreakingChanges) {
    summary = `BREAKING CHANGES (${breakingCount}): ${endpoint} — ${entries
      .filter((e) => e.severity === 'breaking')
      .map((e) => e.message)
      .slice(0, 2)
      .join('; ')}`;
  } else if (warningCount > 0) {
    summary = `WARNING (${warningCount}): ${endpoint} — ${entries
      .filter((e) => e.severity === 'warning')
      .map((e) => e.message)
      .slice(0, 2)
      .join('; ')}`;
  } else {
    summary = `OK (Non-Breaking): ${endpoint} — status ${staging.status} matches prod`;
  }

  return {
    endpoint,
    statusMatch,
    stagingStatus: staging.status,
    prodStatus: prod.status,
    latencyDeltaMs,
    hasBreakingChanges,
    summary,
    entries,
  };
}

export function formatDiffMarkdown(report: DiffReport): string {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const lines: string[] = [
    `### ReqBridge Staging vs Prod Diff — \`${esc(report.endpoint)}\``,
    '',
    `**Summary:** ${String(report.summary || '').replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')}`,
    `- **Status:** staging \`${report.stagingStatus}\` vs prod \`${report.prodStatus}\``,
    `- **Latency Delta:** \`${report.latencyDeltaMs >= 0 ? '+' : ''}${report.latencyDeltaMs}ms\``,
    '',
  ];

  if (report.entries.length === 0) {
    lines.push('No structural or status differences detected.');
  } else {
    lines.push('| Severity | Kind | Path | Detail |');
    lines.push('|---|---|---|---|');
    for (const e of report.entries) {
      lines.push(`| ${esc(e.severity)} | \`${esc(e.kind)}\` | \`${esc(e.path)}\` | ${esc(e.message)} |`);
    }
  }
  return lines.join('\n') + '\n';
}
