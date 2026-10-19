// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  BLOCKED_REQUEST_REASONS,
  MAX_SUMMARISED_REQUESTS,
  SafeModeRequestTally,
} from './safe-mode-requests.js';

const NO_BLOCKED = { method: 0, host: 0, scheme: 0, port: 0 };

describe('SafeModeRequestTally', () => {
  it('starts empty', () => {
    expect(new SafeModeRequestTally().summary()).toEqual({
      allowed: [],
      blocked: [],
      blockedCounts: NO_BLOCKED,
    });
  });

  it('counts requests by method and path, keeping allowed and blocked apart', () => {
    const tally = new SafeModeRequestTally();

    tally.recordAllowed('POST', 'https://app.example.test/auth/refresh-token');
    tally.recordAllowed('POST', 'https://app.example.test/auth/refresh-token');
    tally.recordBlocked('POST', 'https://app.example.test/orders', 'method');
    tally.recordBlocked('DELETE', 'https://app.example.test/orders', 'method');

    expect(tally.summary()).toEqual({
      allowed: [{ method: 'POST', path: '/auth/refresh-token', count: 2 }],
      blocked: [
        { method: 'DELETE', path: '/orders', count: 1, reason: 'method' },
        { method: 'POST', path: '/orders', count: 1, reason: 'method' },
      ],
      blockedCounts: { ...NO_BLOCKED, method: 2 },
    });
  });

  it('keeps a GET blocked for its origin apart from the same request blocked for its method', () => {
    const tally = new SafeModeRequestTally();

    tally.recordBlocked('GET', 'https://app.example.test:8091/brands', 'port');
    tally.recordBlocked('GET', 'https://app.example.test:8091/brands', 'port');
    tally.recordBlocked('GET', 'https://app.example.test:8091/brands', 'method');

    expect(tally.summary().blocked).toEqual([
      { method: 'GET', path: '/brands', count: 2, reason: 'port' },
      { method: 'GET', path: '/brands', count: 1, reason: 'method' },
    ]);
  });

  it('counts every reason in full, even when the listing is capped', () => {
    const tally = new SafeModeRequestTally();
    for (let index = 0; index < MAX_SUMMARISED_REQUESTS + 5; index += 1) {
      tally.recordBlocked('GET', `https://other.example.test/e${String(index)}`, 'host');
    }
    tally.recordBlocked('POST', 'https://app.example.test/orders', 'method');
    tally.recordBlocked('GET', 'http://app.example.test/', 'scheme');
    tally.recordBlocked('GET', 'https://app.example.test:8443/', 'port');

    const summary = tally.summary();

    expect(summary.blocked).toHaveLength(MAX_SUMMARISED_REQUESTS);
    expect(summary.blockedCounts).toEqual({
      method: 1,
      host: MAX_SUMMARISED_REQUESTS + 5,
      scheme: 1,
      port: 1,
    });
  });

  it('names every reason it can report', () => {
    expect(BLOCKED_REQUEST_REASONS).toEqual(['method', 'host', 'scheme', 'port']);
  });

  it('never keeps a query value, and collapses identifiers so one endpoint is one entry', () => {
    const tally = new SafeModeRequestTally();

    tally.recordBlocked('PUT', 'https://app.example.test/tasks/17?token=secret-value', 'method');
    tally.recordBlocked('PUT', 'https://app.example.test/tasks/18?token=another-value', 'method');

    const summary = tally.summary();
    expect(summary.blocked).toEqual([{ method: 'PUT', path: '/tasks/:id', count: 2, reason: 'method' }]);
    expect(JSON.stringify(summary)).not.toContain('secret-value');
  });

  it('lists the busiest first, then by name, and caps the list', () => {
    const tally = new SafeModeRequestTally();
    for (let index = 0; index < MAX_SUMMARISED_REQUESTS + 5; index += 1) {
      tally.recordBlocked('POST', `https://app.example.test/e${String(index).padStart(2, '0')}`, 'method');
    }
    tally.recordBlocked('POST', 'https://app.example.test/busy', 'method');
    tally.recordBlocked('POST', 'https://app.example.test/busy', 'method');

    const { blocked } = tally.summary();
    expect(blocked).toHaveLength(MAX_SUMMARISED_REQUESTS);
    expect(blocked[0]).toEqual({ method: 'POST', path: '/busy', count: 2, reason: 'method' });
    expect(blocked[1]).toEqual({ method: 'POST', path: '/e00', count: 1, reason: 'method' });
  });

  it('keeps a request whose URL cannot be read, without throwing', () => {
    const tally = new SafeModeRequestTally();

    tally.recordBlocked('POST', 'not a url', 'method');

    expect(tally.summary().blocked).toEqual([
      { method: 'POST', path: '[invalid url]', count: 1, reason: 'method' },
    ]);
  });
});
