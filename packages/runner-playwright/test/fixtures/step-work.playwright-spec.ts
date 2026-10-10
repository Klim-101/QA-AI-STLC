// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Specs a generator could plausibly write, each holding the same two required steps but doing very
// different work inside them. The runner decides what a step did from Playwright's own step
// categories, not from the titles written here.
import { expect, test } from '@playwright/test';

const PAGE_HTML = '<button id="go" onclick="document.title=\'done\'">Go</button><p id="result">Saved</p>';

function annotate(testCaseId: string): { annotation: { type: string; description: string } } {
  return { annotation: { type: 'testCaseId', description: testCaseId } };
}

test('empty named steps', annotate('empty-steps'), async () => {
  // The empty bodies are the case under test.
  /* eslint-disable @typescript-eslint/no-empty-function */
  await test.step('[step-1] Save the form', async () => {});
  await test.step('[expected-result] Read the saved record', async () => {});
  /* eslint-enable @typescript-eslint/no-empty-function */
});

test('real work in both steps', annotate('real-work'), async ({ page }) => {
  await page.setContent(PAGE_HTML);
  await test.step('[step-1] Save the form', async () => {
    await page.click('#go');
  });
  await test.step('[expected-result] Read the saved record', async () => {
    await expect(page.locator('#result')).toHaveText('Saved');
  });
});

test('a check that compares two literals', annotate('tautology'), async ({ page }) => {
  await page.setContent(PAGE_HTML);
  await test.step('[step-1] Save the form', async () => {
    await page.click('#go');
  });
  // eslint-disable-next-line @typescript-eslint/require-await -- a check on two literals is the case under test.
  await test.step('[expected-result] Read the saved record', async () => {
    expect(true).toBe(true);
  });
});

test('a controlled violation of the checked behavior', annotate('violation'), async ({ page }) => {
  await page.setContent(PAGE_HTML);
  await test.step('[step-1] Save the form', async () => {
    await page.click('#go');
  });
  await test.step('[expected-result] Read the saved record', async () => {
    await expect(page.locator('#result')).toHaveText('Not what the page shows', { timeout: 500 });
  });
});
