// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';

// A deliberately imperfect contract for the API-diff tests (not one of the catalogued bugs): it
// documents `POST /oauth/revoke-all` (never called by the UI, so never observed), and leaves
// `GET /oauth/issued` and `POST /tasks` out, so a diff has one of every discrepancy kind to
// classify. `{taskId}` differs from the `{id}` an observed route is templated to on purpose.
export const DEMO_OPENAPI_DOCUMENT = {
  openapi: '3.0.3',
  info: { title: 'Demo app API', version: '1.0.0' },
  paths: {
    '/api/whoami': { get: { operationId: 'whoami', responses: { '200': { description: 'The caller.' } } } },
    '/oauth/token': {
      post: { operationId: 'issueToken', responses: { '200': { description: 'A token.' } } },
    },
    '/oauth/revoke-all': {
      post: { operationId: 'revokeAllTokens', responses: { '204': { description: 'Revoked.' } } },
    },
    '/tasks/{taskId}': {
      get: {
        operationId: 'getTask',
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'A task.' } },
      },
    },
  },
} as const;

/** Serves the contract at `GET /openapi.json`, one of the paths `qa api-diff` probes. */
export function createOpenApiRouter(): Router {
  const router = Router();
  router.get('/openapi.json', (_request, response) => {
    response.json(DEMO_OPENAPI_DOCUMENT);
  });
  return router;
}
