// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import { comparableApiPath, listOpenApiEndpoints, parseOpenApiDocument } from './openapi-endpoints.js';

describe('parseOpenApiDocument', () => {
  it('parses a JSON OpenAPI 3.x document', () => {
    expect(parseOpenApiDocument('{"openapi":"3.1.0","paths":{}}')).toEqual({ openapi: '3.1.0', paths: {} });
  });

  it('parses a YAML OpenAPI 3.x document', () => {
    expect(parseOpenApiDocument('openapi: 3.0.3\npaths: {}\n')?.openapi).toBe('3.0.3');
  });

  it.each([
    ['a Swagger 2.0 document', '{"swagger":"2.0"}'],
    ['an unsupported openapi version', '{"openapi":"2.0"}'],
    ['a non-string version', '{"openapi":3}'],
    ['an HTML page', '<html><body>Not found</body></html>'],
    ['a YAML list', '- a\n- b\n'],
    ['unparseable YAML', 'a: [unclosed'],
    ['empty text', ''],
  ])('returns undefined for %s', (_label, text) => {
    expect(parseOpenApiDocument(text)).toBeUndefined();
  });
});

describe('listOpenApiEndpoints', () => {
  it('lists every operation, sorted, keeping operationId and ignoring non-method keys', () => {
    const endpoints = listOpenApiEndpoints({
      openapi: '3.0.3',
      paths: {
        '/tasks/{taskId}': {
          parameters: [{ name: 'taskId' }],
          summary: 'x',
          post: { operationId: 'postTask' },
          get: { operationId: '' },
          trace: { operationId: 'notSupported' },
          put: 'not an operation',
        },
        '/a': { get: {} },
        '/skipped': 'not a path item',
      },
    });
    expect(endpoints).toEqual([
      { method: 'GET', path: '/a', source: 'openapi' },
      { method: 'GET', path: '/tasks/{taskId}', source: 'openapi' },
      { method: 'POST', path: '/tasks/{taskId}', source: 'openapi', operationId: 'postTask' },
    ]);
  });

  it('throws OPENAPI_NO_PATHS when the document has no paths object', () => {
    expect(() => listOpenApiEndpoints({ openapi: '3.0.3' })).toThrow(QaError);
    expect(() => listOpenApiEndpoints({ openapi: '3.0.3', paths: [] })).toThrow(/no "paths"/u);
  });
});

describe('comparableApiPath', () => {
  it('ignores path parameter names', () => {
    expect(comparableApiPath('/tasks/{taskId}/notes/{noteId}')).toBe('/tasks/{}/notes/{}');
    expect(comparableApiPath('/tasks/{id}')).toBe(comparableApiPath('/tasks/{taskId}'));
  });

  it('leaves a path with no parameters unchanged', () => {
    expect(comparableApiPath('/oauth/token')).toBe('/oauth/token');
  });
});
