// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RouteMapSchema } from './route-map.js';

describe('RouteMapSchema', () => {
  it('accepts a route discovered via a link and one discovered via a sitemap', () => {
    const result = RouteMapSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      startUrl: 'https://staging.example.com/',
      routes: [
        { url: 'https://staging.example.com/', discoveredVia: 'link', httpStatus: 200 },
        {
          url: 'https://staging.example.com/tasks',
          discoveredVia: 'link',
          discoveredFrom: 'https://staging.example.com/',
          httpStatus: 200,
        },
        { url: 'https://staging.example.com/sitemap-only', discoveredVia: 'sitemap' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a discovery method outside link and sitemap', () => {
    const result = RouteMapSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      startUrl: 'https://staging.example.com/',
      routes: [{ url: 'https://staging.example.com/', discoveredVia: 'network' }],
    });
    expect(result.success).toBe(false);
  });
});
