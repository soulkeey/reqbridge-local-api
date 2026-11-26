import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ParseError, parseBrunoDirectory, parseInputCollection } from '../src/core/parsers';

describe('Multi-Format Parsers', () => {
  it('parses Postman v2.1 with nested folders, inherited auth, noauth override, bodies, and pm.test', () => {
    const postman = JSON.stringify({
      info: { name: 'Orders API' },
      auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{apiToken}}' }] },
      variable: [{ key: 'baseUrl', value: 'https://api.example.com' }],
      item: [
        {
          name: 'Orders',
          item: [
            {
              name: 'Create Order',
              event: [
                { listen: 'prerequest', script: { exec: ['console.log("pre")'] } },
                { listen: 'test', script: { exec: ['pm.response.to.have.status(201);'] } },
              ],
              request: {
                method: 'POST',
                header: [{ key: 'X-Trace', value: '123' }],
                url: {
                  raw: '{{baseUrl}}/v2/orders?env=staging',
                  query: [
                    { key: 'env', value: 'staging' },
                    { key: 'ignored', value: 'x', disabled: true },
                  ],
                },
                body: { mode: 'raw', raw: '{"sku":"A1"}', options: { raw: { language: 'json' } } },
              },
            },
            {
              name: 'Public Health',
              request: {
                method: 'GET',
                auth: { type: 'noauth' },
                url: '{{baseUrl}}/health?verbose=1',
              },
            },
            {
              name: 'Upload Receipt',
              request: {
                method: 'POST',
                url: '{{baseUrl}}/receipts',
                body: {
                  mode: 'formdata',
                  formdata: [
                    { key: 'orderId', value: 'ord_1', type: 'text' },
                    { key: 'file', src: 'receipt.pdf', type: 'file' },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const col = parseInputCollection(postman);
    assert.equal(col.name, 'Orders API');
    assert.equal(col.requests.length, 3);
    assert.equal(col.warnings.length, 1);

    const r0 = col.requests[0];
    assert.deepEqual(r0.folder, ['Orders']);
    assert.equal(r0.url, '{{baseUrl}}/v2/orders');
    assert.deepEqual(r0.query, [{ key: 'env', value: 'staging' }]);
    assert.equal(r0.auth?.type, 'bearer');
    assert.equal(r0.inheritedAuth, true);
    assert.equal(r0.body?.contentType, 'application/json');
    assert.deepEqual(r0.tests, ['pm.response.to.have.status(201);']);

    const r1 = col.requests[1];
    assert.equal(r1.auth?.type, 'none');
    assert.equal(r1.inheritedAuth, false);
    assert.deepEqual(r1.query, [{ key: 'verbose', value: '1' }]);

    const r2 = col.requests[2];
    assert.equal(r2.body?.mode, 'formdata');
    assert.equal(r2.body?.fields?.[1].type, 'file');
  });

  it('parses Thunder Client JSON with folder tree, cycle guard, params, auth, and tests', () => {
    const thunder = JSON.stringify({
      collectionName: 'Thunder Billing',
      folders: [
        { _id: 'f1', name: 'V2', containerId: 'f_cycle' },
        { _id: 'f_cycle', name: 'Root', containerId: 'f1' },
      ],
      requests: [
        {
          name: 'Get Invoice',
          containerId: 'f1',
          method: 'GET',
          url: 'https://api.example.com/invoices/{id}?expand=lines',
          params: [
            { name: 'id', value: 'inv_1', isPath: true },
            { name: 'currency', value: 'USD', isPath: false },
            { name: 'off', value: '1', isDisabled: true },
          ],
          headers: [{ name: 'Accept', value: 'application/json' }],
          auth: { type: 'bearer', bearer: '{{jwt}}' },
          tests: [{ type: 'res-code', value: '200' }],
        },
      ],
    });

    const col = parseInputCollection(thunder);
    assert.equal(col.name, 'Thunder Billing');
    assert.equal(col.requests.length, 1);
    const r = col.requests[0];
    assert.deepEqual(r.folder, ['Root', 'V2']);
    assert.equal(r.url, 'https://api.example.com/invoices/{id}');
    assert.deepEqual(r.query, [
      { key: 'expand', value: 'lines' },
      { key: 'currency', value: 'USD' },
    ]);
    assert.equal(r.auth?.type, 'bearer');
    assert.deepEqual(r.tests, ['status == 200']);
  });

  it('parses Bruno .bru with nested JSON/JS braces and parseBrunoDirectory inheritance', () => {
    const files = [
      { path: 'bruno.json', content: JSON.stringify({ name: 'Checkout Bru' }) },
      {
        path: 'environments/staging.bru',
        content: 'vars {\n  baseUrl: https://staging.example.com\n}\n',
      },
      {
        path: 'collection.bru',
        content: 'headers {\n  X-Client: reqbridge\n}\nauth:bearer {\n  token: {{token}}\n}\n',
      },
      {
        path: 'orders/create.bru',
        content: [
          'meta {',
          '  name: Create Order',
          '  seq: 2',
          '}',
          'post {',
          '  url: {{baseUrl}}/v2/orders?dryRun=false',
          '  body: json',
          '  auth: inherit',
          '}',
          'body:json {',
          '  {',
          '    "meta": { "source": "web}" },',
          '    "amount": 1900',
          '  }',
          '}',
          'tests {',
          '  test("created", function() {',
          '    expect(res.getStatus()).to.equal(201);',
          '  });',
          '}',
        ].join('\n'),
      },
      {
        path: 'orders/health.bru',
        content: 'meta {\n  name: Health\n  seq: 1\n}\nget {\n  url: {{baseUrl}}/health\n}\nauth:apikey {\n  key: api_key\n  value: {{k}}\n  placement: query\n}\n',
      },
    ];

    const col = parseBrunoDirectory(files);
    assert.equal(col.name, 'Checkout Bru');
    assert.equal(col.variables.baseUrl, 'https://staging.example.com');
    assert.equal(col.requests.length, 2);
    assert.equal(col.requests[0].name, 'Health');
    assert.equal(col.requests[0].auth?.in, 'query');
    assert.equal(col.requests[1].name, 'Create Order');
    assert.equal(col.requests[1].inheritedAuth, true);
    assert.equal(col.requests[1].headers['X-Client'], 'reqbridge');
    assert.ok(col.requests[1].body?.raw?.includes('"source": "web}"'));
    assert.ok(col.requests[1].tests.some((t) => t.includes('expect(res.getStatus())')));
  });

  it('parses .http files with @vars, ### blocks, multiline query, and # @assert', () => {
    const http = [
      '@baseUrl = https://api.example.com',
      '',
      '### List Orders',
      '# @name list_orders',
      'GET {{baseUrl}}/orders',
      '  ?status={{status}}',
      '  &limit=20',
      'Authorization: Bearer {{tok}}',
      '# @assert status == 200',
    ].join('\n');

    const col = parseInputCollection(http);
    assert.equal(col.variables.baseUrl, 'https://api.example.com');
    assert.equal(col.requests.length, 1);
    assert.equal(col.requests[0].url, '{{baseUrl}}/orders');
    assert.deepEqual(col.requests[0].query, [
      { key: 'status', value: '{{status}}' },
      { key: 'limit', value: '20' },
    ]);
    assert.deepEqual(col.requests[0].tests, ['status == 200']);
  });

  it('throws typed ParseError on empty, invalid JSON, unsupported format, and invalid syntax', () => {
    assert.throws(
      () => parseInputCollection('   '),
      (err: unknown) => err instanceof ParseError && err.code === 'EMPTY_INPUT'
    );
    assert.throws(
      () => parseInputCollection('{bad json'),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_JSON'
    );
    assert.throws(
      () => parseInputCollection('{"foo": 1}'),
      (err: unknown) => err instanceof ParseError && err.code === 'UNSUPPORTED_FORMAT'
    );
    assert.throws(
      () => parseInputCollection('{"foo": 1}', 'postman'),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_POSTMAN_SCHEMA'
    );
    assert.throws(
      () => parseInputCollection('{"foo": 1}', 'thunder'),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_THUNDER_SCHEMA'
    );
    assert.throws(
      () => parseInputCollection('get {\n  url: https://x.test\n', 'bruno'),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_BRU_SYNTAX'
    );
    assert.throws(
      () => parseInputCollection('### empty block', 'http'),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_HTTP_SYNTAX'
    );
  });

  it('handles Challenger/Reviewer parser edge cases (Postman disabled query+port, Thunder dedup, Bruno apostrophes+folder auth:none, .http comments)', () => {
    const postman = parseInputCollection(JSON.stringify({
      info: { name: 'Edge Postman' },
      item: [
        {
          name: 'Disabled Query',
          request: {
            method: 'GET',
            url: {
              raw: 'https://api.example.com/ping?debug=1&trace=2',
              query: [
                { key: 'debug', value: '1', disabled: true },
                { key: 'trace', value: '2', disabled: true },
              ],
            },
          },
        },
        {
          name: 'Port Object URL',
          request: {
            method: 'GET',
            url: { protocol: 'https', host: ['api', 'example', 'com'], port: '8443', path: ['v1', 'ping'] },
          },
        },
      ],
    }));
    assert.equal(postman.requests[0].url, 'https://api.example.com/ping');
    assert.deepEqual(postman.requests[0].query, []);
    assert.equal(postman.requests[1].url, 'https://api.example.com:8443/v1/ping');

    const thunder = parseInputCollection(JSON.stringify({
      collectionName: 'Thunder Dedup',
      requests: [{
        name: 'Dup Query',
        method: 'GET',
        url: 'https://api.example.com/items?expand=lines',
        params: [
          { name: 'expand', value: 'lines', isPath: false },
          { name: 'currency', value: 'USD', isPath: false },
        ],
      }],
    }));
    assert.deepEqual(thunder.requests[0].query, [
      { key: 'expand', value: 'lines' },
      { key: 'currency', value: 'USD' },
    ]);

    const bruText = parseInputCollection([
      'meta {',
      '  name: Text Note',
      '}',
      'post {',
      '  url: https://api.example.com/notes',
      '  body: text',
      '}',
      'body:text {',
      "  It's working",
      "  User's order succeeded",
      '}',
      'tests {',
      "  // check user's status",
      "  /* don't break on apostrophe */",
      '  test("ok", () => { expect(res.getStatus()).to.equal(200); });',
      '}',
    ].join('\n'), 'bruno');
    assert.ok(bruText.requests[0].body?.raw?.includes("It's working"));
    assert.ok(bruText.requests[0].tests.some((t) => t.includes('expect(res.getStatus())')));

    const bruDir = parseBrunoDirectory([
      { path: 'collection.bru', content: 'auth:bearer {\n  token: {{tok}}\n}\n' },
      { path: 'public/folder.bru', content: 'auth:none {}\n' },
      { path: 'public/ping.bru', content: 'meta {\n  name: Public Ping\n  seq: 1\n}\nget {\n  url: https://api.example.com/ping\n  auth: inherit\n}\n' },
      { path: 'open/folder.bru', content: 'auth {\n  mode: none\n}\n' },
      { path: 'open/ping.bru', content: 'meta {\n  name: Open Ping\n  seq: 2\n}\nget {\n  url: https://api.example.com/open\n  auth: inherit\n}\n' },
      { path: 'private/me.bru', content: 'meta {\n  name: Me\n  seq: 3\n}\nget {\n  url: https://api.example.com/me\n  auth: inherit\n}\n' },
    ]);
    assert.equal(bruDir.requests[0].auth?.type, 'none');
    assert.equal(bruDir.requests[0].inheritedAuth, false);
    assert.equal(bruDir.requests[1].auth?.type, 'none');
    assert.equal(bruDir.requests[1].inheritedAuth, false);
    assert.equal(bruDir.requests[2].auth?.type, 'bearer');
    assert.equal(bruDir.requests[2].inheritedAuth, true);

    const httpWithComments = parseInputCollection([
      '# File header comment',
      '// Another comment',
      '',
      '@base = https://api.example.com',
      '',
      '### First',
      'GET {{base}}/a',
      '',
      '@secondVar = v2',
      '### Second Request',
      'GET {{base}}/b?v={{secondVar}}',
    ].join('\n'), 'http');
    assert.equal(httpWithComments.variables.base, 'https://api.example.com');
    assert.equal(httpWithComments.variables.secondVar, 'v2');
    assert.equal(httpWithComments.requests[0].body, undefined);

    const bruStaleAuth = parseBrunoDirectory([
      { path: 'collection.bru', content: 'auth:apikey {\n  key: X-Api-Key\n  value: {{k}}\n  placement: header\n}\n' },
      {
        path: 'child.bru',
        content: [
          'meta {',
          '  name: Inherit Over Stale',
          '  seq: 1',
          '}',
          'get {',
          '  url: https://api.example.com/c',
          '  auth: inherit',
          '}',
          'auth:bearer {',
          '  token: stale_token',
          '}',
        ].join('\n'),
      },
      {
        path: 'none.bru',
        content: [
          'meta {',
          '  name: None Over Stale',
          '  seq: 2',
          '}',
          'get {',
          '  url: https://api.example.com/n',
          '  auth: none',
          '}',
          'auth:bearer {',
          '  token: stale_token',
          '}',
        ].join('\n'),
      },
    ]);
    assert.equal(bruStaleAuth.requests[0].auth?.type, 'apikey');
    assert.equal(bruStaleAuth.requests[0].inheritedAuth, true);
    assert.equal(bruStaleAuth.requests[1].auth?.type, 'none');
    assert.equal(bruStaleAuth.requests[1].inheritedAuth, false);
  });

  it('rejects path traversal / unsafe paths in parseBrunoDirectory while ignoring safe non-.bru files (T2-F2-06)', () => {
    assert.throws(
      () =>
        parseBrunoDirectory([
          { path: 'bruno.json', content: '{"name":"Safe"}' },
          { path: '../../etc/passwd.bru', content: 'meta {\n  name: Evil\n}\nget {\n  url: http://127.0.0.1/evil\n}' },
        ]),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_BRU_SYNTAX' && /traversal|invalid|unsafe|path/i.test(err.message)
    );
    assert.throws(
      () => parseBrunoDirectory([{ path: '/etc/evil.bru', content: 'get {\n  url: http://127.0.0.1\n}' }]),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_BRU_SYNTAX'
    );
    assert.throws(
      () => parseBrunoDirectory([{ path: 'C:\\evil.bru', content: 'get {\n  url: http://127.0.0.1\n}' }]),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_BRU_SYNTAX'
    );
    assert.throws(
      () => parseBrunoDirectory([{ path: 'a\0b.bru', content: 'get {\n  url: http://127.0.0.1\n}' }]),
      (err: unknown) => err instanceof ParseError && err.code === 'INVALID_BRU_SYNTAX'
    );

    const safe = parseBrunoDirectory([
      { path: 'bruno.json', content: '{"name":"Safe Bruno"}' },
      { path: 'README.md', content: '# ignore me' },
      { path: 'orders/get.bru', content: 'meta {\n  name: Get Order\n}\nget {\n  url: https://api.example.com/orders\n}' },
    ]);
    assert.equal(safe.requests.length, 1);
    assert.equal(safe.requests[0].name, 'Get Order');
  });

  it('prioritizes explicit auth:<mode> block over earlier leftover auth:* blocks in Bruno .bru', () => {
    const col = parseInputCollection(
      [
        'meta {',
        '  name: Multi Auth',
        '}',
        'get {',
        '  url: https://api.example.com/me',
        '  auth: bearer',
        '}',
        'auth:apikey {',
        '  key: X-Old-Key',
        '  value: old_val',
        '}',
        'auth:bearer {',
        '  token: {{liveToken}}',
        '}',
      ].join('\n'),
      'bruno'
    );
    assert.equal(col.requests[0].auth?.type, 'bearer');
    assert.equal(col.requests[0].auth?.token, '{{liveToken}}');
  });
});
