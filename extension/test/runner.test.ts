import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { exportCiBundle } from '../src/core/ci-exporter';
import { ParseError, parseInputCollection } from '../src/core/parsers';
import { exportBatchMarkdown, exportJUnitXml, parseCsvRows, runBatch } from '../src/core/runner';
import { toHttpFile } from '../src/core/transpiler';
import { RequestSpec } from '../src/core/types';

const execFileAsync = promisify(execFile);

function startMockServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        }, 300);
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (url.pathname === '/orders' && req.method === 'POST') {
          const parsed = JSON.parse(body || '{}') as { sku?: string; fail?: boolean };
          if (parsed.fail || parsed.sku === 'BAD') {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_sku' }));
            return;
          }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ created: true, sku: parsed.sku, auth: req.headers.authorization || '' }));
          return;
        }
        if (url.pathname === '/fail500') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 1, error: 'boom' }));
          return;
        }
        if (url.pathname === '/upload' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ contentType: req.headers['content-type'] || '', body }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: 1, query: url.searchParams.get('q') }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}

describe('Batch Runner, Reports & Executable CI Bundle', () => {
  it('parses RFC 4180 CSV with BOM, quoted commas/newlines, and escaped quotes', () => {
    const csv = '\uFEFFsku,note,expected\r\n"A,1","line1\n""quoted""",201\r\nB2,simple,201\r\n';
    const rows = parseCsvRows(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].sku, 'A,1');
    assert.equal(rows[0].note, 'line1\n"quoted"');
    assert.equal(rows[1].sku, 'B2');
    assert.deepEqual(parseCsvRows('sku,note\n'), []);
    assert.throws(
      () => parseCsvRows('sku,note\n"unclosed,1'),
      (err: unknown) => err instanceof ParseError
    );
  });

  it('runs real HTTP batches against 127.0.0.1, handles timeouts, and exports JUnit XML + Markdown', async () => {
    const { server, baseUrl } = await startMockServer();
    try {
      const reqs: RequestSpec[] = [
        {
          id: 'create_order',
          name: 'Create Order & <Check> | Pipe',
          folder: [],
          method: 'POST',
          url: '{{baseUrl}}/orders',
          headers: {},
          query: [],
          auth: { type: 'bearer', token: '{{tok}}' },
          body: { mode: 'raw', contentType: 'application/json', raw: '{"sku":"{{sku}}"}' },
          tests: ['pm.response.to.have.status(201);', 'pm.expect(res).to.include("created")'],
          sourceFormat: 'http',
        },
      ];
      const rows = [{ sku: 'OK1' }, { sku: 'BAD' }, { sku: 'OK2' }];
      const report = await runBatch(reqs, rows, { baseUrl, tok: 'secret_1' }, { concurrency: 2, timeoutMs: 2000 });

      assert.equal(report.totalExecutions, 3);
      assert.equal(report.passedCount, 2);
      assert.equal(report.failedCount, 1);
      assert.ok(report.p50LatencyMs >= 0);
      assert.ok(report.p95LatencyMs >= report.p50LatencyMs);

      const xml = exportJUnitXml(report);
      assert.ok(xml.includes('tests="3" failures="1"'));
      assert.ok(xml.includes('Create Order &amp; &lt;Check&gt; | Pipe'));
      assert.ok(xml.includes('<failure message='));

      const md = exportBatchMarkdown(report);
      assert.ok(md.includes('2 passed · 1 failed'));
      assert.ok(md.includes('### Failures'));
      assert.ok(md.includes('Create Order & <Check> \\| Pipe'));

      const timeoutReport = await runBatch(
        [{ id: 'slow', name: 'Slow', folder: [], method: 'GET', url: `${baseUrl}/slow`, headers: {}, query: [], tests: [], sourceFormat: 'http' }],
        [{}],
        {},
        { timeoutMs: 60 }
      );
      assert.equal(timeoutReport.failedCount, 1);
      assert.ok(timeoutReport.results[0].error);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('exports a genuinely runnable CI .mjs script and executes it against live HTTP server', async () => {
    const { server, baseUrl } = await startMockServer();
    const tmpDir = await fs.mkdtemp(path.join(__dirname, 'ci-run-'));
    try {
      const { runnerJs, workflowYml } = exportCiBundle('api.http', 'data.csv');
      assert.ok(workflowYml.includes('actions/setup-node@v4'));
      assert.ok(workflowYml.includes('reqbridge-results.xml'));

      const httpFile = [
        `### Create Order`,
        `POST ${baseUrl}/orders`,
        `Content-Type: application/json`,
        ``,
        `{"sku":"{{sku}}"}`,
        ``,
        `# @assert pm.response.to.have.status(201)`,
      ].join('\n');

      await fs.writeFile(path.join(tmpDir, 'api.http'), httpFile, 'utf8');
      await fs.writeFile(path.join(tmpDir, 'data.csv'), 'sku\nSKU1\nSKU2\n', 'utf8');
      await fs.writeFile(path.join(tmpDir, 'reqbridge-ci.mjs'), runnerJs, 'utf8');

      const { stdout } = await execFileAsync(process.execPath, ['reqbridge-ci.mjs'], { cwd: tmpDir });
      assert.ok(stdout.includes('2/2 passed'));
      const junit = await fs.readFile(path.join(tmpDir, 'reqbridge-results.xml'), 'utf8');
      assert.ok(junit.includes('tests="2" failures="0"'));

      await fs.writeFile(path.join(tmpDir, 'data.csv'), 'sku\nBAD\n', 'utf8');
      await assert.rejects(
        () => execFileAsync(process.execPath, ['reqbridge-ci.mjs'], { cwd: tmpDir }),
        (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 1
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('sends real multipart FormData with boundary, evaluates res.status/body contains/field assertions, and fails CI on HTTP 500 or failed asserts', async () => {
    const { server, baseUrl } = await startMockServer();
    const tmpDir = await fs.mkdtemp(path.join(__dirname, 'ci-edge-'));
    try {
      const uploadReq: RequestSpec = {
        id: 'upload_1',
        name: 'Upload Form',
        folder: [],
        method: 'POST',
        url: `${baseUrl}/upload`,
        headers: { 'Content-Type': 'multipart/form-data' },
        query: [],
        body: {
          mode: 'formdata',
          contentType: 'multipart/form-data',
          fields: [
            { key: 'orderId', value: 'ord_{{id}}', type: 'text' },
            { key: 'receipt', value: 'pdf-bytes', type: 'file' },
          ],
        },
        tests: ['res.status: eq 200', 'body contains "ord_42"', 'contentType == multipart/form-data'],
        sourceFormat: 'postman',
      };
      const formReport = await runBatch([uploadReq], [{ id: '42' }], {});
      assert.equal(formReport.passedCount, 0);
      assert.ok(formReport.results[0].assertions[0].passed);
      assert.ok(formReport.results[0].assertions[1].passed);
      assert.equal(formReport.results[0].assertions[2].passed, false, 'contentType includes boundary so exact match differs');

      const rawProbe = await runBatch(
        [{ ...uploadReq, tests: ['res.status: eq 200', 'body contains "boundary="', 'body contains "pdf-bytes"', 'pm.expect(1).to.eql(1)'] }],
        [{ id: '42' }],
        {}
      );
      assert.equal(rawProbe.passedCount, 0);
      assert.equal(rawProbe.results[0].assertions[0].passed, true);
      assert.equal(rawProbe.results[0].assertions[1].passed, true);
      assert.equal(rawProbe.results[0].assertions[2].passed, true);
      assert.equal(rawProbe.results[0].assertions[3].passed, false);
      assert.ok(rawProbe.results[0].assertions[3].detail?.includes('unsupported assertion'));

      const exported = toHttpFile(parseInputCollection(JSON.stringify({
        info: { name: 'RT' },
        variable: [{ key: 'baseUrl', value: baseUrl }],
        item: [{ name: 'Ok', request: { method: 'GET', url: '{{baseUrl}}/ok' }, event: [{ listen: 'test', script: { exec: ['res.status: eq 200'] } }] }],
      })));
      const { runnerJs } = exportCiBundle('rt.http');
      await fs.writeFile(path.join(tmpDir, 'reqbridge-ci.mjs'), runnerJs, 'utf8');
      await fs.writeFile(path.join(tmpDir, 'rt.http'), exported.httpContent, 'utf8');
      const rtRun = await execFileAsync(process.execPath, ['reqbridge-ci.mjs'], {
        cwd: tmpDir,
        env: { ...process.env, REQBRIDGE_HTTP_FILE: 'rt.http' },
      });
      assert.ok(rtRun.stdout.includes('1/1 passed'));

      const headerAssertHttp = `### Fail Header Assert\nGET ${baseUrl}/fail500\n# @assert res.status: eq 200\n`;
      await fs.writeFile(path.join(tmpDir, 'hdr.http'), headerAssertHttp, 'utf8');
      await assert.rejects(
        () => execFileAsync(process.execPath, ['reqbridge-ci.mjs'], { cwd: tmpDir, env: { ...process.env, REQBRIDGE_HTTP_FILE: 'hdr.http' } }),
        (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 1
      );
      const hdrXml = await fs.readFile(path.join(tmpDir, 'reqbridge-results.xml'), 'utf8');
      assert.ok(hdrXml.includes('Expected status 200, got 500'));

      const blankAssertHttp = [
        `### Fail Blank Asserts`,
        `GET ${baseUrl}/fail500`,
        ``,
        `# @assert res.status: eq 200`,
        `# @assert body contains "NOT_PRESENT"`,
        `# @assert id == 999`,
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'blank.http'), blankAssertHttp, 'utf8');
      await assert.rejects(
        () => execFileAsync(process.execPath, ['reqbridge-ci.mjs'], { cwd: tmpDir, env: { ...process.env, REQBRIDGE_HTTP_FILE: 'blank.http' } }),
        (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 1
      );

      const ok200BadBodyHttp = [
        `### Fail Body Asserts on 200`,
        `GET ${baseUrl}/ok`,
        ``,
        `# @assert body contains "NOT_PRESENT"`,
        `# @assert id == 999`,
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'badbody.http'), ok200BadBodyHttp, 'utf8');
      await assert.rejects(
        () => execFileAsync(process.execPath, ['reqbridge-ci.mjs'], { cwd: tmpDir, env: { ...process.env, REQBRIDGE_HTTP_FILE: 'badbody.http' } }),
        (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 1
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('evaluates quote-paired to.include/body contains and Bruno res.body: contains in both runBatch and CI bundle', async () => {
    const { server, baseUrl } = await startMockServer();
    const tmpDir = await fs.mkdtemp(path.join(__dirname, 'ci-quotes-'));
    try {
      const bruCol = parseInputCollection([
        'meta {',
        '  name: Bruno Missing Needle',
        '}',
        'get {',
        `  url: ${baseUrl}/ok`,
        '}',
        'assert {',
        '  res.status: eq 200',
        '  res.body: contains NOT_FOUND_IN_RESPONSE',
        '}',
      ].join('\n'), 'bruno');

      const failBatch = await runBatch(
        [
          {
            id: 'quote_fail',
            name: 'Quote Fail',
            folder: [],
            method: 'GET',
            url: `${baseUrl}/ok`,
            headers: {},
            query: [],
            tests: [
              'pm.expect(pm.response.text()).to.include("It\'s missing")',
              'body contains \'Say "hi"\'',
              'res.body: contains "NOT_FOUND"',
            ],
            sourceFormat: 'http',
          },
          ...bruCol.requests,
        ],
        [{}],
        {}
      );
      assert.equal(failBatch.passedCount, 0);
      assert.equal(failBatch.failedCount, 2);
      assert.equal(failBatch.results[0].assertions[0].passed, false);
      assert.equal(failBatch.results[0].assertions[0].detail, 'missing "It\'s missing"');
      assert.equal(failBatch.results[0].assertions[1].passed, false);
      assert.equal(failBatch.results[0].assertions[1].detail, 'missing "Say "hi""');
      assert.equal(failBatch.results[0].assertions[2].passed, false);
      assert.equal(failBatch.results[1].assertions[1].passed, false);
      assert.equal(failBatch.results[1].assertions[1].detail, 'missing "NOT_FOUND_IN_RESPONSE"');

      const passBatch = await runBatch(
        [
          {
            id: 'quote_pass',
            name: 'Quote Pass',
            folder: [],
            method: 'GET',
            url: `${baseUrl}/ok?q=It%27s+working`,
            headers: {},
            query: [],
            tests: [
              'pm.expect(pm.response.text()).to.include("It\'s working")',
              'body contains \'"ok":true\'',
              'res.body: contains "id":1',
              'res.body: contains working',
            ],
            sourceFormat: 'bruno',
          },
        ],
        [{}],
        {}
      );
      assert.equal(passBatch.passedCount, 1);

      const { runnerJs } = exportCiBundle('q.http');
      await fs.writeFile(path.join(tmpDir, 'reqbridge-ci.mjs'), runnerJs, 'utf8');

      for (const [fname, content] of [
        ['ci-inc.http', `### Inc\nGET ${baseUrl}/ok\n# @assert pm.expect(pm.response.text()).to.include("It's missing")\n`],
        ['ci-sq.http', `### SQ\nGET ${baseUrl}/ok\n# @assert body contains 'Say "hi"'\n`],
        ['ci-bru.http', toHttpFile(bruCol).httpContent],
      ]) {
        await fs.writeFile(path.join(tmpDir, fname), content, 'utf8');
        await assert.rejects(
          () => execFileAsync(process.execPath, ['reqbridge-ci.mjs'], { cwd: tmpDir, env: { ...process.env, REQBRIDGE_HTTP_FILE: fname } }),
          (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 1
        );
      }

      const ciPassHttp = [
        `### Pass Quotes & Bruno`,
        `GET ${baseUrl}/ok?q=It%27s+working`,
        `# @assert pm.expect(pm.response.text()).to.include("It's working")`,
        `# @assert body contains '"ok":true'`,
        `# @assert res.body: contains "id":1`,
        `# @assert res.body: contains working`,
      ].join('\n');
      await fs.writeFile(path.join(tmpDir, 'ci-pass.http'), ciPassHttp, 'utf8');
      const okRun = await execFileAsync(process.execPath, ['reqbridge-ci.mjs'], {
        cwd: tmpDir,
        env: { ...process.env, REQBRIDGE_HTTP_FILE: 'ci-pass.http' },
      });
      assert.ok(okRun.stdout.includes('1/1 passed'));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects unsafe filenames in exportCiBundle while allowing clean relative paths', () => {
    for (const [httpName, csvName] of [
      ['', undefined],
      ['   ', undefined],
      ['requests.http', ''],
      ['requests.http', '   '],
      ['../../etc/passwd.http', undefined],
      ['sub/../../evil.http', undefined],
      ['/etc/passwd.http', undefined],
      ['\\windows\\evil.http', undefined],
      ['C:\\evil.http', undefined],
      ['req\0.http', undefined],
      ['req;rm -rf /.http', undefined],
      ['req.http', 'evil`id`.csv'],
      ['req.http', '$(whoami).csv'],
      ['req\nname.http', undefined],
    ] as Array<[string, string | undefined]>) {
      assert.throws(() => exportCiBundle(httpName, csvName), /Unsafe or invalid/);
    }

    for (const [httpName, csvName] of [
      ['requests.http', undefined],
      ['sub/requests.http', 'data/orders-batch.csv'],
      ['api/orders v2.http', 'sample-data.csv'],
    ] as Array<[string, string | undefined]>) {
      const bundle = exportCiBundle(httpName, csvName);
      assert.ok(bundle.workflowYml.includes(httpName));
      if (csvName) assert.ok(bundle.workflowYml.includes(csvName));
    }
  });
});
