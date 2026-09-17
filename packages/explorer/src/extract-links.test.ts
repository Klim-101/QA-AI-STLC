// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { extractLinks } from './extract-links.js';
import { createFakeCrawlPage } from './test-support/fake-browser-launcher.js';

describe('extractLinks', () => {
  it('returns the string links a page evaluates to', async () => {
    const page = createFakeCrawlPage({
      linksByUrl: { 'https://example.com/': ['https://example.com/tasks', 'https://example.com/dashboard'] },
    });
    await page.goto('https://example.com/');

    await expect(extractLinks(page)).resolves.toEqual([
      'https://example.com/tasks',
      'https://example.com/dashboard',
    ]);
  });

  it('returns an empty array when evaluate does not resolve to an array', async () => {
    const page = createFakeCrawlPage();
    await page.goto('https://example.com/');

    await expect(extractLinks(page)).resolves.toEqual([]);
  });

  it('drops non-string entries from the evaluated result', async () => {
    const page = createFakeCrawlPage({
      linksByUrl: {
        'https://example.com/': [
          'https://example.com/ok',
          123 as unknown as string,
          null as unknown as string,
        ],
      },
    });
    await page.goto('https://example.com/');

    await expect(extractLinks(page)).resolves.toEqual(['https://example.com/ok']);
  });
});
