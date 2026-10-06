// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { MAX_SUMMARISED_REQUESTS, SafeModeRequestTally } from './safe-mode-requests.js';

describe('SafeModeRequestTally', () => {
  it('starts empty', () => {
    expect(new SafeModeRequestTally().summary()).toEqual({ allowed: [], blocked: [] });
  });

  it('counts requests by method and path, keeping allowed and blocked apart', () => {
    const tally = new SafeModeRequestTally();

    tally.recordAllowed('POST', 'https://app.example.test/auth/refresh-token');
    tally.recordAllowed('POST', 'https://app.example.test/auth/refresh-token');
    tally.recordBlocked('POST', 'https://app.example.test/orders');
    tally.recordBlocked('DELETE', 'https://app.example.test/orders');

    expect(tally.summary()).toEqual({
      allowed: [{ method: 'POST', path: '/auth/refresh-token', count: 2 }],
      blocked: [
        { method: 'DELETE', path: '/orders', count: 1 },
        { method: 'POST', path: '/orders', count: 1 },
      ],
    });
  });

  it('never keeps a query value, and collapses identifiers so one endpoint is one entry', () => {
    const tally = new SafeModeRequestTally();

    tally.recordBlocked('PUT', 'https://app.example.test/tasks/17?token=secret-value');
    tally.recordBlocked('PUT', 'https://app.example.test/tasks/18?token=another-value');

    const summary = tally.summary();
    expect(summary.blocked).toEqual([{ method: 'PUT', path: '/tasks/:id', count: 2 }]);
    expect(JSON.stringify(summary)).not.toContain('secret-value');
  });

  it('lists the busiest first, then by name, and caps the list', () => {
    const tally = new SafeModeRequestTally();
    for (let index = 0; index < MAX_SUMMARISED_REQUESTS + 5; index += 1) {
      tally.recordBlocked('POST', `https://app.example.test/e${String(index).padStart(2, '0')}`);
    }
    tally.recordBlocked('POST', 'https://app.example.test/busy');
    tally.recordBlocked('POST', 'https://app.example.test/busy');

    const { blocked } = tally.summary();
    expect(blocked).toHaveLength(MAX_SUMMARISED_REQUESTS);
    expect(blocked[0]).toEqual({ method: 'POST', path: '/busy', count: 2 });
    expect(blocked[1]).toEqual({ method: 'POST', path: '/e00', count: 1 });
  });

  it('keeps a request whose URL cannot be read, without throwing', () => {
    const tally = new SafeModeRequestTally();

    tally.recordBlocked('POST', 'not a url');

    expect(tally.summary().blocked).toEqual([{ method: 'POST', path: '[invalid url]', count: 1 }]);
  });
});
