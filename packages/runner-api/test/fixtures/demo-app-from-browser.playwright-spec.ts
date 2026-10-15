// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test';

// What the generated `apiAuth('stage-api')` helper does, inlined: the helper lives in the project a
// run writes it to, which a fixture shared by every run cannot import.
const resolved = JSON.parse(process.env.QA_API_AUTH_RESOLVED ?? '{}') as Record<
  string,
  { headers: Record<string, string>; params: Record<string, string> } | undefined
>;

test(
  'whoami accepts the token the signed-in page used',
  { annotation: { type: 'testCaseId', description: 'demo-api-whoami-signed-in' } },
  async ({ request }) => {
    const response = await request.get('/api/whoami', resolved['stage-api']);
    expect(response.status()).toBe(200);
  },
);
