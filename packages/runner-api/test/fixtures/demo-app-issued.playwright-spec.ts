// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test';

// Its case targets GET /oauth/issued, which the demo app's contract deliberately leaves out, so the
// API runner must reject this spec before it ever sends the request.
test(
  'issued-token counter answers',
  { annotation: { type: 'testCaseId', description: 'demo-api-issued-counter' } },
  async ({ request }) => {
    const response = await request.get('/oauth/issued');
    expect(response.status()).toBe(200);
  },
);
