// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createFakeCrawlPage } from '@qa-ai-stlc/test-utils/fake-crawl-browser-launcher';
import {
  extractRouteCandidates,
  HISTORY_CAPTURE_SCRIPT,
  installHistoryCapture,
  resolveRouteAttributeValue,
} from './extract-route-candidates.js';

const PAGE_URL = 'https://example.com/nodes/list';

describe('resolveRouteAttributeValue', () => {
  it.each([
    ['/nodes/overview', 'https://example.com/nodes/overview'],
    ['overview', 'https://example.com/nodes/overview'],
    ['https://example.com/other', 'https://example.com/other'],
    ['/nodes,5', 'https://example.com/nodes/5'],
    ['/nodes, ,/5,', 'https://example.com/nodes/5'],
  ])('resolves %s', (value, expected) => {
    expect(resolveRouteAttributeValue(value, PAGE_URL)).toBe(expected);
  });

  it.each(['', '   ', 'javascript:alert(1)', 'mailto:a@example.com', 'http://[invalid'])(
    'drops %j',
    (value) => {
      expect(resolveRouteAttributeValue(value, PAGE_URL)).toBeUndefined();
    },
  );
});

describe('installHistoryCapture', () => {
  it('registers the capture script before the page loads', async () => {
    const page = createFakeCrawlPage();

    await installHistoryCapture(page);

    expect(page.initScripts).toEqual([HISTORY_CAPTURE_SCRIPT]);
  });

  it('ships a script that parses as JavaScript', () => {
    expect(() => new Script(HISTORY_CAPTURE_SCRIPT)).not.toThrow();
  });
});

describe('extractRouteCandidates', () => {
  it('reads router attributes and History API pushes, resolved against the page URL', async () => {
    const page = createFakeCrawlPage({
      routeAttributeValuesByUrl: { [PAGE_URL]: ['/dashboard', 'javascript:void(0)', 'detail,7'] },
      historyUrlsByUrl: { [PAGE_URL]: ['https://example.com/pushed', 'about:blank'] },
    });
    await page.goto(PAGE_URL);

    await expect(extractRouteCandidates(page)).resolves.toEqual([
      { url: 'https://example.com/dashboard', discoveredVia: 'router-attribute' },
      { url: 'https://example.com/nodes/detail/7', discoveredVia: 'router-attribute' },
      { url: 'https://example.com/pushed', discoveredVia: 'history-api' },
    ]);
  });

  it('finds nothing when the page evaluates to something other than a list', async () => {
    const page = createFakeCrawlPage();
    await page.goto(PAGE_URL);

    await expect(extractRouteCandidates(page)).resolves.toEqual([]);
  });

  it('drops non-string and oversized entries, and caps how many it reads', async () => {
    const many = Array.from({ length: 600 }, (_, index) => `/page-${String(index)}`);
    const page = createFakeCrawlPage({
      routeAttributeValuesByUrl: {
        [PAGE_URL]: [42 as unknown as string, `/${'a'.repeat(3_000)}`, ...many],
      },
    });
    await page.goto(PAGE_URL);

    const candidates = await extractRouteCandidates(page);

    expect(candidates).toHaveLength(500);
    expect(candidates[0]?.url).toBe('https://example.com/page-0');
  });
});
