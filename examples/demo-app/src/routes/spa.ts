// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';

/**
 * Two POST endpoints for `public/spa-session.html` (ADR-0014; not one of the catalogued bugs): a
 * single-page application that opens its session with `POST /api/spa/session` on every load, which
 * safe mode would abort, and one that creates a record, which it must keep aborting.
 * `GET /api/spa/orders` reports how many orders were created, so a test can tell that a blocked
 * request never reached the server.
 *
 * Two more for `public/spa-query.html` (ADR-0018): a product list read with the `QUERY` method, which
 * is a safe read and must load in safe mode, and four mutating methods on one path, counted by
 * `GET /api/spa/mutations`, which safe mode must keep aborting before they reach the server.
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

  // Express has no route helper for `QUERY`, so the method is matched here.
  router.use('/api/spa/products', (request, response, next) => {
    if (request.method !== 'QUERY') {
      next();
      return;
    }
    response.json({ products: ['Claw hammer', 'Hand saw', 'Pliers'] });
  });

  let mutationCount = 0;
  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    router[method]('/api/spa/mutations', (_request, response) => {
      mutationCount += 1;
      response.status(201).json({ mutations: mutationCount });
    });
  }

  router.get('/api/spa/mutations', (_request, response) => {
    response.json({ mutations: mutationCount });
  });

  return router;
}
