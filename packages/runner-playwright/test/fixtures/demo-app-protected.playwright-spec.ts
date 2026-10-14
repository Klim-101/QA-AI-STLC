// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// A spec for a page behind sign-in (P6-89). It carries no credential: the runner starts the browser
// from the environment identity's session, so the page opens instead of redirecting to `/login`.
import { expect, test } from '@playwright/test';

test(
  'the dashboard opens for a signed-in user',
  { annotation: { type: 'testCaseId', description: 'demo-app-protected-dashboard' } },
  async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Role: admin')).toBeVisible();
  },
);
