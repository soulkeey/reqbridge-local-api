import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffResponses, formatDiffMarkdown } from '../src/core/diff';

describe('Staging vs Prod Schema-Drift Diff Engine', () => {
  it('detects breaking type_shift, missing_key, status_drift, latency regression, and additive keys', () => {
    const report = diffResponses(
      'GET /v2/orders/ord_1',
      {
        status: 200,
        latencyMs: 226,
        headers: {},
        bodyText: JSON.stringify({
          id: 'ord_1',
          currency_code: 'USD',
          tax_exempt: false,
          items: [{ qty: 2 }],
        }),
      },
      {
        status: 422,
        latencyMs: 42,
        headers: {},
        bodyText: JSON.stringify({
          id: 'ord_1',
          currency_code: 840,
          legacy_flag: true,
          items: [{ qty: 1 }, { qty: 3 }],
        }),
      }
    );

    assert.equal(report.statusMatch, false);
    assert.equal(report.hasBreakingChanges, true);
    assert.equal(report.latencyDeltaMs, 184);

    assert.ok(report.entries.some((e) => e.kind === 'status_drift' && e.severity === 'breaking'));
    assert.ok(report.entries.some((e) => e.kind === 'latency_delta' && e.severity === 'warning'));
    assert.ok(report.entries.some((e) => e.kind === 'type_shift' && e.path === '$.currency_code' && e.severity === 'breaking'));
    assert.ok(report.entries.some((e) => e.kind === 'missing_key' && e.path === '$.legacy_flag' && e.severity === 'breaking'));
    assert.ok(report.entries.some((e) => e.kind === 'added_key' && e.path === '$.tax_exempt' && e.severity === 'non-breaking'));
    assert.ok(report.entries.some((e) => e.kind === 'value_mismatch' && e.path === '$.items[0].qty'));

    const md = formatDiffMarkdown(report);
    assert.ok(md.includes('GET /v2/orders/ord_1'));
    assert.ok(md.includes('type_shift'));
  });

  it('reports non-breaking OK summary when status and schema match with additive field only', () => {
    const report = diffResponses(
      'GET /v1/users/me',
      { status: 200, latencyMs: 35, headers: {}, bodyText: '{"id":"u1","tier":"pro"}' },
      { status: 200, latencyMs: 31, headers: {}, bodyText: '{"id":"u1"}' }
    );
    assert.equal(report.hasBreakingChanges, false);
    assert.ok(report.summary.startsWith('OK (Non-Breaking)'));
  });

  it('records warning when response body is invalid JSON', () => {
    const report = diffResponses(
      'GET /bad',
      { status: 200, latencyMs: 10, headers: {}, bodyText: '<html>bad gateway</html>' },
      { status: 200, latencyMs: 10, headers: {}, bodyText: '{"ok":true}' }
    );
    assert.ok(report.entries.some((e) => e.kind === 'body_parse_error' && e.severity === 'warning'));
  });

  it('flags breaking change when one response body is empty and the other is JSON or non-empty even on HTTP 200', () => {
    const emptyStaging = diffResponses(
      'GET /empty-staging',
      { status: 200, latencyMs: 20, headers: {}, bodyText: '' },
      { status: 200, latencyMs: 20, headers: {}, bodyText: '{"id":100,"ok":true}' }
    );
    assert.equal(emptyStaging.hasBreakingChanges, true);
    assert.ok(emptyStaging.summary.startsWith('BREAKING CHANGES'));
    assert.ok(emptyStaging.entries.some((e) => e.severity === 'breaking' && e.kind === 'body_parse_error'));

    const emptyProd = diffResponses(
      'GET /empty-prod',
      { status: 200, latencyMs: 20, headers: {}, bodyText: '{"id":100}' },
      { status: 200, latencyMs: 20, headers: {}, bodyText: '   ' }
    );
    assert.equal(emptyProd.hasBreakingChanges, true);
    assert.ok(emptyProd.entries.some((e) => e.severity === 'breaking'));

    const emptyVsText = diffResponses(
      'GET /empty-vs-text',
      { status: 200, latencyMs: 20, headers: {}, bodyText: '' },
      { status: 200, latencyMs: 20, headers: {}, bodyText: 'plain-text-ok' }
    );
    assert.equal(emptyVsText.hasBreakingChanges, true);
  });
});
