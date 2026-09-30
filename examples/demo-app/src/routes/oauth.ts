// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';

export const DEMO_CLIENT_ID = 'demo-client';
export const DEMO_CLIENT_SECRET = 'demo-secret';

const DEFAULT_TOKEN_TTL_SECONDS = 3600;

/**
 * A fake OAuth2 client-credentials server for the API-auth tests (not one of the catalogued bugs).
 * State lives in the returned router, so every app instance starts with no tokens issued.
 *
 * - `POST /oauth/token` issues an opaque bearer token for the demo client.
 * - `GET /oauth/demo-token` issues a token without a form post, for `public/token-demo.html`, a page
 *   that keeps it in a cookie, localStorage and sessionStorage the way a single-page app would.
 * - `GET /api/whoami` accepts a live token and, on purpose, echoes it back so tests can prove the
 *   engine scrubs an echoed credential from evidence.
 * - `POST /oauth/revoke-all` drops every live token, which makes the next `whoami` answer 401.
 * - `GET /oauth/issued` reports how many tokens were ever issued, so a test can tell reuse from
 *   re-acquisition.
 */
export function createOAuthRouter(): Router {
  const router = Router();
  const liveTokens = new Map<string, number>();
  let issuedCount = 0;
  const ttlSeconds = Number(process.env.DEMO_TOKEN_TTL_SECONDS ?? DEFAULT_TOKEN_TTL_SECONDS);

  function issueToken(): string {
    issuedCount += 1;
    const token = `demo-token-${String(issuedCount)}`;
    liveTokens.set(token, Date.now() + ttlSeconds * 1000);
    return token;
  }

  router.post('/oauth/token', (request, response) => {
    const body = request.body as Record<string, unknown>;
    if (body.grant_type !== 'client_credentials') {
      response.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }
    if (body.client_id !== DEMO_CLIENT_ID || body.client_secret !== DEMO_CLIENT_SECRET) {
      response.status(401).json({ error: 'invalid_client' });
      return;
    }
    response.json({ access_token: issueToken(), token_type: 'Bearer', expires_in: ttlSeconds });
  });

  router.get('/oauth/demo-token', (_request, response) => {
    response.json({ access_token: issueToken() });
  });

  router.get('/api/whoami', (request, response) => {
    const token = /^Bearer (.+)$/u.exec(request.get('authorization') ?? '')?.[1];
    const expiresAtMs = token === undefined ? undefined : liveTokens.get(token);
    if (token === undefined || expiresAtMs === undefined || expiresAtMs <= Date.now()) {
      response.status(401).json({ error: 'invalid_token' });
      return;
    }
    response.json({ client: DEMO_CLIENT_ID, token });
  });

  router.post('/oauth/revoke-all', (_request, response) => {
    liveTokens.clear();
    response.status(204).end();
  });

  router.get('/oauth/issued', (_request, response) => {
    response.json({ issued: issuedCount });
  });

  return router;
}
