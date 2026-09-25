// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// A hand-written spec (P3-01's own acceptance criterion), not generated: it exercises the demo
// app's real login form the same way `packages/core/test/case-execution-demo-app.test.ts` does
// interactively, but as an ordinary Playwright test the runner executes end to end. Named
// `*.playwright-spec.ts`, not `*.spec.ts`: Vitest's own default include glob matches `*.spec.ts`
// too, which would make it try (and fail) to run this file itself as a Vitest test — the runner's
// own `testMatch` lists a spec by its exact path, so it does not depend on this naming at all.
import { expect, test } from '@playwright/test';

test(
  'user can log in',
  { annotation: { type: 'testCaseId', description: 'demo-app-login' } },
  async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@example.com');
    await page.fill('input[name="password"]', 'admin123');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  },
);

test(
  'a wrong password is rejected',
  { annotation: { type: 'testCaseId', description: 'demo-app-login-wrong-password' } },
  async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@example.com');
    await page.fill('input[name="password"]', 'not-the-real-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    // Deliberately wrong expectation: proves the runner reports a real Playwright assertion
    // failure as `status: 'failed'` with a failure message, not a thrown error of its own.
    await expect(page).toHaveURL(/\/dashboard/);
  },
);
