// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';

/**
 * Reads every `<a href>` on the current page. The callback runs inside the browser (Playwright
 * serializes it across the CDP boundary), so it can reference DOM globals unavailable to the rest
 * of this package; `AuthPage.evaluate` is untyped for exactly that reason, so the result is
 * narrowed here instead of trusted.
 */
export async function extractLinks(page: AuthPage): Promise<readonly string[]> {
  /* v8 ignore next 3 -- runs in the browser's own V8 instance, invisible to Node coverage */
  const result: unknown = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((anchor) => (anchor as HTMLAnchorElement).href),
  );
  if (!Array.isArray(result)) {
    return [];
  }
  return result.filter((item): item is string => typeof item === 'string');
}
