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
 *
 * And `GET /api/cross/products` for `public/spa-cross-origin.html` (ADR-0019): a read that carries
 * `Access-Control-Allow-Origin`, so a page served from another port may call it, as an application
 * on one port does with its API on another.
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

  let crossReadCount = 0;
  router.get('/api/cross/products', (_request, response) => {
    crossReadCount += 1;
    response.set('Access-Control-Allow-Origin', '*');
    response.json({ products: ['Claw hammer', 'Hand saw', 'Pliers'] });
  });

  // How many times the read above reached this server, so a test can tell a request safe mode
  // aborted before the network from one that was answered.
  router.get('/api/cross/reads', (_request, response) => {
    response.json({ reads: crossReadCount });
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
