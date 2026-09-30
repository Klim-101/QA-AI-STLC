// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test';

test(
  'whoami rejects a request with no token',
  { annotation: { type: 'testCaseId', description: 'demo-api-whoami-unauthenticated' } },
  async ({ request }) => {
    const response = await request.get('/api/whoami');
    expect(response.status()).toBe(401);
  },
);
