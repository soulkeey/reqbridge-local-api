import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseInputCollection } from '../src/core/parsers';
import { toCurlCommand, toHttpFile, toOpenApiYaml } from '../src/core/transpiler';

describe('OpenAPI 3.0/3.1 -> .http & cURL Import/Export', () => {
  it('parses OpenAPI 3.1 YAML with servers, $ref schemas, securitySchemes, and params into .http', () => {
    const yaml = `
openapi: 3.1.0
info:
  title: Billing Spec
  version: 1.0.0
servers:
  - url: https://api.billing.test/v1
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    CreateInvoice:
      type: object
      properties:
        customerId:
          type: string
          example: cust_99
        amount:
          type: integer
          example: 1900
        paid:
          type: boolean
paths:
  /invoices/{invoiceId}:
    get:
      summary: Get Invoice
      security:
        - bearerAuth: []
      parameters:
        - name: invoiceId
          in: path
          required: true
          example: inv_101
        - name: expand
          in: query
          example: lines
        - name: X-Trace-Id
          in: header
          example: tr_1
      responses:
        '200':
          description: OK
  /invoices:
    post:
      summary: Create Invoice
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateInvoice'
      responses:
        '201':
          description: Created
`;
    const col = parseInputCollection(yaml, 'auto');
    assert.equal(col.name, 'Billing Spec');
    assert.equal(col.variables.baseUrl, 'https://api.billing.test/v1');
    assert.equal(col.variables.invoiceId, 'inv_101');
    assert.equal(col.requests.length, 2);

    const getReq = col.requests[0];
    assert.equal(getReq.method, 'GET');
    assert.equal(getReq.url, '{{baseUrl}}/invoices/{{invoiceId}}');
    assert.deepEqual(getReq.query, [{ key: 'expand', value: 'lines' }]);
    assert.equal(getReq.headers['X-Trace-Id'], 'tr_1');
    assert.equal(getReq.auth?.type, 'bearer');
    assert.deepEqual(getReq.tests, ['status == 200']);

    const postReq = col.requests[1];
    assert.equal(postReq.method, 'POST');
    assert.ok(postReq.body?.raw?.includes('"customerId": "cust_99"'));
    assert.ok(postReq.body?.raw?.includes('"amount": 1900'));

    const { httpContent, envExample } = toHttpFile(col);
    assert.ok(httpContent.includes('GET {{baseUrl}}/invoices/{{invoiceId}}?expand=lines'));
    assert.ok(httpContent.includes('Authorization: Bearer {{apiToken}}'));
    assert.ok(httpContent.includes('# @assert status == 201'));
    assert.ok(envExample.includes('apiToken='));
  });

  it('parses OpenAPI 3.0 JSON with apiKey security and round-trips to OpenAPI 3.1 YAML', () => {
    const specJson = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'Catalog API', version: '2.0.0' },
      servers: [{ url: 'https://catalog.example.com' }],
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        },
      },
      security: [{ apiKey: [] }],
      paths: {
        '/items': {
          get: {
            operationId: 'listItems',
            parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }],
            responses: { '200': { description: 'List' } },
          },
        },
      },
    });
    const col = parseInputCollection(specJson);
    assert.equal(col.requests.length, 1);
    assert.equal(col.requests[0].auth?.type, 'apikey');
    assert.equal(col.requests[0].auth?.key, 'X-Api-Key');
    assert.deepEqual(col.requests[0].query, [{ key: 'limit', value: '20' }]);

    const roundTripYaml = toOpenApiYaml(col);
    assert.ok(roundTripYaml.includes('openapi: 3.1.0'));
    assert.ok(roundTripYaml.includes('/items:'));
  });

  it('parses multi-line cURL commands and exports shell-escaped cURL via toCurlCommand()', () => {
    const curlInput = [
      "curl -X POST 'https://api.example.com/v2/orders?dryRun=true' \\",
      "  -H 'Authorization: Bearer tok_123' \\",
      "  -H 'Content-Type: application/json' \\",
      "  --data-raw '{\"customer\":\"O'\\''Reilly\",\"amount\":19}'",
    ].join('\n');

    const col = parseInputCollection(curlInput);
    assert.equal(col.requests.length, 1);
    const req = col.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, 'https://api.example.com/v2/orders');
    assert.deepEqual(req.query, [{ key: 'dryRun', value: 'true' }]);
    assert.equal(req.auth?.type, 'bearer');
    assert.equal(req.auth?.token, 'tok_123');
    assert.equal(req.body?.raw, '{"customer":"O\'Reilly","amount":19}');

    const exportedCurl = toCurlCommand(req);
    assert.ok(exportedCurl.startsWith("curl -X POST 'https://api.example.com/v2/orders?dryRun=true'"));
    const reparsed = parseInputCollection(exportedCurl, 'curl');
    assert.equal(reparsed.requests[0].method, 'POST');
    assert.equal(reparsed.requests[0].body?.raw, '{"customer":"O\'Reilly","amount":19}');
  });

  it('handles cURL -u basic auth and -G query mode cleanly', () => {
    const col = parseInputCollection('curl -G https://api.example.com/search -u alice:secret -d q=reqbridge -d page=2');
    const req = col.requests[0];
    assert.equal(req.method, 'GET');
    assert.equal(req.auth?.type, 'basic');
    assert.equal(req.auth?.username, 'alice');
    assert.equal(req.auth?.password, 'secret');
    assert.deepEqual(req.query, [{ key: 'q', value: 'reqbridge' }, { key: 'page', value: '2' }]);
  });
});
