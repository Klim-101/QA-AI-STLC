// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { RunResult } from '@qa-ai-stlc/schemas';
import { classifyFailureKind, selectRunFailures } from './triage-failures.js';

const ASSERTION_ON_FOUND_ELEMENT = [
  'Error: expect(locator).toHaveText(expected)',
  '',
  'Expected pattern: /Welcome, \\w+/',
  'Received string:  "Welcome, "',
  '',
  'Call log:',
  "  - waiting for getByRole('heading')",
  '    - locator resolved to <h1>Welcome, </h1>',
].join('\n');

describe('classifyFailureKind', () => {
  it.each([
    ['page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/', 'network'],
    ['connect ECONNREFUSED 127.0.0.1:3000', 'network'],
    ['getaddrinfo ENOTFOUND staging.example.test', 'network'],
    [
      "Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Save' })",
      'locator-not-found',
    ],
    ["Error: strict mode violation: locator('li') resolved to 3 elements", 'locator-not-found'],
    ['expect(locator).toBeVisible()\nLocator resolved to 0 elements', 'locator-not-found'],
    [
      'Error: expect(page).toHaveURL(expected)\n\nExpected pattern: /dashboard/\nReceived string: "/login"',
      'assertion-mismatch',
    ],
    ['expect(received).toBe(expected)', 'assertion-mismatch'],
    [ASSERTION_ON_FOUND_ELEMENT, 'assertion-mismatch'],
    ['Something else went wrong', 'other'],
  ])('reads %j as %s', (message, kind) => {
    expect(classifyFailureKind(message)).toBe(kind);
  });

  it('reports a network error before any other reading, since it says nothing about the application', () => {
    expect(classifyFailureKind("net::ERR_NAME_NOT_RESOLVED while waiting for locator('x')")).toBe('network');
  });
});

describe('selectRunFailures', () => {
  const base: RunResult = {
    schemaVersion: 1,
    id: 'r1',
    runId: 'run-1',
    testCaseId: 'login',
    testType: 'e2e',
    status: 'failed',
    startedAt: '2026-10-10T10:00:00Z',
    finishedAt: '2026-10-10T10:00:01Z',
    evidenceIds: [],
    failure: { message: 'boom' },
  };

  it('keeps only failed results of the run, ordered by case then result', () => {
    const results: RunResult[] = [
      { ...base, id: 'b', testCaseId: 'zeta' },
      { ...base, id: 'a', testCaseId: 'zeta' },
      { ...base, id: 'c', testCaseId: 'alpha' },
      { ...base, id: 'd', status: 'passed' },
      { ...base, id: 'e', runId: 'run-2' },
    ];

    expect(selectRunFailures(results, 'run-1').map((result) => result.id)).toEqual(['c', 'a', 'b']);
  });

  it('leaves out a failed result that carries no failure, which the schema never produces', () => {
    const withoutFailure: RunResult = { ...base, failure: undefined };

    expect(selectRunFailures([withoutFailure], 'run-1')).toEqual([]);
  });
});
