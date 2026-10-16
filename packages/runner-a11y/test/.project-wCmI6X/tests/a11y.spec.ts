import { test } from '@playwright/test';
import { scanAccessibility } from './qa/a11y-scan.js';

test(
  'fixture page is accessible',
  { annotation: { type: 'testCaseId', description: 'demo-a11y-fixture' } },
  async ({ page }, testInfo) => {
    await page.goto('/a11y-fixture.html');
    await scanAccessibility(page, testInfo);
  },
);
