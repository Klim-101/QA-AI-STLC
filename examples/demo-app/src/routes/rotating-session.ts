// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { requireAuth } from '../auth.js';

const ROTATING_COOKIE = 'qa_rotating';
const PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public', import.meta.url));

declare module 'express-session' {
  interface SessionData {
    rotatingToken?: string;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  const pair = (header ?? '').split(';').find((part) => part.trim().startsWith(`${name}=`));
  return pair?.trim().slice(name.length + 1);
}

/**
 * `/rotating/<name>` (P6-103; not one of the catalogued bugs) is a signed-in page that, like an
 * application whose refresh token is single-use, accepts each session token once and hands out the
 * next in a cookie. A browser context that starts from the state the sign-in produced works for the
 * first page and is sent to the sign-in page for every later one, unless it starts from the state
 * the previous context ended with. The page itself is `explore-reveal.html`.
 */
export function createRotatingSessionRouter(): Router {
  const router = Router();

  router.get('/rotating/:name', requireAuth, (request, response) => {
    const presented = readCookie(request.headers.cookie, ROTATING_COOKIE);
    const issued = request.session.rotatingToken;
    if (issued !== undefined && presented !== issued) {
      response.redirect('/login');
      return;
    }
    const next = randomUUID();
    request.session.rotatingToken = next;
    response.cookie(ROTATING_COOKIE, next, { httpOnly: true });
    response.sendFile('explore-reveal.html', { root: PUBLIC_DIRECTORY });
  });

  return router;
}
