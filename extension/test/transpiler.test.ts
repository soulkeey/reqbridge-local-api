import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseInputCollection } from '../src/core/parsers';
import { toHttpFile, toOpenApiYaml } from '../src/core/transpiler';

describe('Transpilers (.http, .env.example, OpenAPI 3.1 YAML)', () => {
  it('generates lossless .http and secret-safe .env.example without duplicating query strings', () => {
    const col = parseInputCollection(
      JSON.stringify({
        info: { name: 'Shop API' },
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{apiToken}}' }] },
        variable: [
          { key: 'baseUrl', value: 'https://shop.example.com' },
          { key: 'apiToken', value: 'super-secret-value' },
        ],
        item: [
          {
            name: 'Search Items',
            request: {
              method: 'GET',
              url: {
                raw: '{{baseUrl}}/items?q={{searchTerm}}',
                query: [{ key: 'q', value: '{{searchTerm}}' }],
              },
            },
            event: [{ listen: 'test', script: { exec: ['pm.response.to.have.status(200);'] } }],
          },
        ],
      })
    );

    const { httpContent, envExample } = toHttpFile(col);
    assert.ok(httpContent.includes('# [Inherited parent folder auth preserved]'));
    assert.ok(httpContent.includes('@baseUrl = https://shop.example.com'));
    assert.ok(httpContent.includes('# @apiToken configured via .env'));
    assert.equal(httpContent.includes('super-secret-value'), false);
    assert.ok(httpContent.includes('GET {{baseUrl}}/items?q={{searchTerm}}'));
    assert.equal(httpContent.match(/\?q=/g)?.length, 1);
    assert.ok(httpContent.includes('Authorization: Bearer {{apiToken}}'));
    assert.ok(httpContent.includes('# @assert pm.response.to.have.status(200);'));

    const roundTripped = parseInputCollection(httpContent, 'http');
    assert.equal(roundTripped.variables.baseUrl, 'https://shop.example.com');

    assert.ok(envExample.includes('baseUrl=https://shop.example.com'));
    assert.ok(envExample.includes('apiToken=\n'));
    assert.equal(envExample.includes('super-secret-value'), false);
    assert.ok(envExample.includes('searchTerm='));
  });

  it('merges non-adjacent paths and emits parameters, schemas, securitySchemes, and inferred status codes in OpenAPI 3.1', () => {
    const col = parseInputCollection(
      JSON.stringify({
        info: { name: 'Non-Adjacent Orders API' },
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] },
        variable: [{ key: 'baseUrl', value: 'https://api.example.com' }],
        item: [
          {
            name: 'List Order',
            request: {
              method: 'GET',
              header: [{ key: 'X-Org-Id', value: 'org_1' }],
              url: '{{baseUrl}}/v2/orders/:orderId?include=items',
            },
          },
          {
            name: 'List Users',
            request: {
              method: 'GET',
              url: '{{baseUrl}}/v2/users/{{userId}}',
            },
          },
          {
            name: 'Update Order',
            event: [{ listen: 'test', script: { exec: ['pm.response.to.have.status(201);'] } }],
            request: {
              method: 'POST',
              url: '{{baseUrl}}/v2/orders/:orderId',
              body: {
                mode: 'raw',
                raw: '{"amount": {{amount}}, "currency": "USD"}',
                options: { raw: { language: 'json' } },
              },
            },
          },
        ],
      })
    );

    const yaml = toOpenApiYaml(col);
    assert.ok(yaml.startsWith('openapi: 3.1.0\n'));
    const orderPathOccurrences = yaml.match(/^  \/v2\/orders\/\{orderId\}:$/gm) || [];
    assert.equal(orderPathOccurrences.length, 1, 'non-adjacent /v2/orders/{orderId} paths must merge');

    assert.ok(yaml.includes('/v2/users/{userId}:'));
    assert.ok(yaml.includes('- name: orderId\n          in: path\n          required: true'));
    assert.ok(yaml.includes('- name: include\n          in: query'));
    assert.ok(yaml.includes('- name: X-Org-Id\n          in: header'));
    assert.ok(yaml.includes('bearerAuth:\n      type: http\n      scheme: bearer'));
    assert.ok(yaml.includes('currency:\n                  type: string'));
    assert.ok(yaml.includes('"201":'));
  });

  it('quotes YAML prefixes/booleans/keys, parses templated JSON arrays, infers Bruno 201, and merges duplicate (path, method)', () => {
    const yaml = toOpenApiYaml({
      name: '- My API',
      variables: { baseUrl: 'https://api.example.com' },
      warnings: [],
      requests: [
        {
          id: 'dash_req',
          name: '- Leading dash name',
          folder: [],
          method: 'POST',
          url: '{{baseUrl}}/items',
          headers: {},
          query: [{ key: 'mode', value: 'fast' }],
          body: {
            mode: 'raw',
            contentType: 'application/json',
            raw: '{"count": {{count}}, "active": {{flag}}, "label": "{{lbl}}", "ids": [{{id1}}, {{id2}}], "true": 1, "null": 2, "-k": 3}',
          },
          tests: ['- assert_dash', '? question_assert', 'expect(res.getStatus()).to.equal(201);'],
          sourceFormat: 'bruno',
        },
        {
          id: 'dup_req',
          name: 'Duplicate POST',
          folder: [],
          method: 'POST',
          url: '{{baseUrl}}/items',
          headers: { 'X-Extra': '1' },
          query: [{ key: 'dryRun', value: 'true' }],
          tests: ['status == 202'],
          sourceFormat: 'bruno',
        },
      ],
    });

    assert.ok(yaml.includes('title: "- My API"'));
    assert.ok(yaml.includes('summary: "- Leading dash name"'));
    assert.ok(yaml.includes('- "- assert_dash"'));
    assert.ok(yaml.includes('- "? question_assert"'));
    assert.ok(yaml.includes('"true":'));
    assert.ok(yaml.includes('"null":'));
    assert.ok(yaml.includes('"-k":'));
    assert.ok(yaml.includes('ids:\n                  type: array'));
    assert.ok(yaml.includes('"201":'));
    assert.ok(yaml.includes('"202":'));
    assert.equal(yaml.match(/^    post:$/gm)?.length, 1);
    assert.ok(yaml.includes('- name: dryRun\n          in: query'));
    assert.ok(yaml.includes('- name: X-Extra\n          in: header'));
  });

  it('quotes YAML 1.1 value/merge indicators (=, <<), ISO dates/timestamps, and underscore numbers in scalars and keys', () => {
    const yaml = toOpenApiYaml({
      name: '2026-11-26',
      variables: { baseUrl: 'https://api.example.com' },
      warnings: [],
      requests: [
        {
          id: '1_000',
          name: '=',
          folder: [],
          method: 'POST',
          url: '{{baseUrl}}/yaml-edge',
          headers: {},
          query: [],
          body: {
            mode: 'raw',
            contentType: 'application/json',
            raw: '{"=": 1, "<<": 2, "2026-11-26": 3, "1_000": 4}',
          },
          tests: ['=', '<<', '2026-11-26', '2026-11-26T12:00', '1_000', '+1_000', '0_1', '1_000.5_0', '+0x1_a'],
          sourceFormat: 'bruno',
        },
      ],
    });

    assert.ok(yaml.includes('title: "2026-11-26"'));
    assert.ok(yaml.includes('summary: "="'));
    assert.ok(yaml.includes('operationId: "1_000"'));
    for (const val of ['=', '<<', '2026-11-26', '2026-11-26T12:00', '1_000', '+1_000', '0_1', '1_000.5_0', '+0x1_a']) {
      assert.ok(yaml.includes(`- "${val}"`), `expected quoted assertion scalar for ${val}`);
    }
    for (const key of ['=', '<<', '2026-11-26', '1_000']) {
      assert.ok(yaml.includes(`"${key}":`), `expected quoted map key for ${key}`);
    }
  });

  it('escapes YAML Unicode line breaks (\\u0085, \\u2028, \\u2029) in scalars and keys for lossless round-trip', () => {
    const yaml = toOpenApiYaml({
      name: 'Line\u0085Break\u2028API\u2029',
      variables: { baseUrl: 'https://api.example.com' },
      warnings: [],
      requests: [
        {
          id: 'unicode_lb',
          name: 'Test\u2028Endpoint',
          folder: [],
          method: 'POST',
          url: '{{baseUrl}}/lb',
          headers: {},
          query: [],
          body: {
            mode: 'raw',
            contentType: 'application/json',
            raw: '{"nel\\u0085key": "v1", "ls": "a\\u2028b", "ps": "c\\u2029d"}',
          },
          tests: ['val\u0085ok'],
          sourceFormat: 'http',
        },
      ],
    });
    assert.ok(yaml.includes('title: "Line\\u0085Break\\u2028API\\u2029"'));
    assert.ok(yaml.includes('summary: "Test\\u2028Endpoint"'));
    assert.ok(yaml.includes('"nel\\u0085key":'));
    assert.ok(yaml.includes('- "val\\u0085ok"'));
  });
});
