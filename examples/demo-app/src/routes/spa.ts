// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';

/**
 * Two POST endpoints for `public/spa-session.html` (ADR-0014; not one of the catalogued bugs): a
 * single-page application that opens its session with `POST /api/spa/session` on every load, which
 * safe mode would abort, and one that creates a record, which it must keep aborting.
 * `GET /api/spa/orders` reports how many orders were created, so a test can tell that a blocked
 * request never reached the server.
 */
export function createSpaRouter(): Router {
  const router = Router();
  let orderCount = 0;

  router.post('/api/spa/session', (_request, response) => {
    response.json({ ok: true });
  });

  router.post('/api/spa/orders', (_request, response) => {
    orderCount += 1;
    response.status(201).json({ orders: orderCount });
  });

  router.get('/api/spa/orders', (_request, response) => {
    response.json({ orders: orderCount });
  });

  return router;
}
