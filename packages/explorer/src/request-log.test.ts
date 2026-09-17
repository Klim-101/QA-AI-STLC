// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildRequestLogHar } from './request-log.js';

describe('buildRequestLogHar', () => {
  it('builds a HAR document with one entry per request', () => {
    const har = JSON.parse(
      buildRequestLogHar(
        [
          { method: 'GET', url: 'https://example.com/', status: 200, blocked: false },
          { method: 'POST', url: 'https://example.com/tasks', blocked: true },
        ],
        '2026-09-17T00:00:00Z',
      ),
    ) as { log: { entries: unknown[] } };

    expect(har.log.entries).toEqual([
      {
        startedDateTime: '2026-09-17T00:00:00Z',
        blocked: false,
        request: { method: 'GET', url: 'https://example.com/', headers: [], cookies: [] },
        response: { status: 200, headers: [], cookies: [] },
      },
      {
        startedDateTime: '2026-09-17T00:00:00Z',
        blocked: true,
        request: { method: 'POST', url: 'https://example.com/tasks', headers: [], cookies: [] },
      },
    ]);
  });
});
