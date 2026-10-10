// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  SECURITY_CHECK_CLASSES,
  SecurityAuditResultSchema,
  SecurityAuthorizationSchema,
  SecurityFindingSchema,
} from './security.js';

function baseAuthorization() {
  return {
    environment: {
      name: 'staging',
      baseUrl: 'https://staging.example.test/',
      allowlist: ['staging.example.test'],
    },
    checks: ['headers', 'cookies'],
    identities: [
      { name: 'member', role: 'low' },
      { name: 'admin', role: 'high' },
    ],
    prohibitedActions: ['brute force', 'denial of service'],
    allowedMutations: [
      { method: 'POST', path: '/tasks/ping', reason: 'A no-op endpoint owned by the test team' },
    ],
    restrictedRoutes: ['/admin/users'],
    logoutPath: '/logout',
    rateLimit: { requestsPerSecond: 2, maxRequests: 200 },
    createdAt: '2026-10-10T10:00:00Z',
  };
}

function baseFinding() {
  return {
    id: 'finding-1',
    checkClass: 'cookies',
    riskArea: 'Session management',
    confidence: 'high',
    severityProposal: 'major',
    title: 'Session cookie is readable from scripts',
    steps: ['Sign in', 'Read the Set-Cookie header of the response'],
    expectedResult: 'The session cookie carries HttpOnly',
    actualResult: 'The session cookie has no HttpOnly attribute',
    remediation: 'Set HttpOnly on the session cookie',
    regressionCheck: 'Assert the Set-Cookie header of the sign-in response contains HttpOnly',
    requestIndexes: [0],
  };
}

describe('SecurityAuthorizationSchema', () => {
  it('accepts a complete authorization and fills the schema version', () => {
    const parsed = SecurityAuthorizationSchema.parse(baseAuthorization());

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.allowedMutations).toHaveLength(1);
  });

  it('defaults the optional lists to empty', () => {
    const minimal = {
      ...baseAuthorization(),
      allowedMutations: undefined,
      restrictedRoutes: undefined,
      logoutPath: undefined,
    };

    const parsed = SecurityAuthorizationSchema.parse(minimal);

    expect(parsed.allowedMutations).toEqual([]);
    expect(parsed.restrictedRoutes).toEqual([]);
    expect(parsed.logoutPath).toBeUndefined();
  });

  it.each([
    ['no check classes', { checks: [] }],
    ['an unknown check class', { checks: ['xss'] }],
    ['a duplicate check class', { checks: ['headers', 'headers'] }],
    [
      'a duplicate identity',
      {
        identities: [
          { name: 'a', role: 'low' },
          { name: 'a', role: 'high' },
        ],
      },
    ],
    ['no prohibited actions', { prohibitedActions: [] }],
    ['a zero request rate', { rateLimit: { requestsPerSecond: 0, maxRequests: 10 } }],
    ['a fractional request budget', { rateLimit: { requestsPerSecond: 1, maxRequests: 1.5 } }],
    ['an empty allowlist', { environment: { name: 's', baseUrl: 'https://x.test/', allowlist: [] } }],
    [
      'a mutation path that names another host',
      { allowedMutations: [{ method: 'POST', path: '//evil.test/x', reason: 'r' }] },
    ],
    [
      'a mutation path that is a full URL',
      { allowedMutations: [{ method: 'POST', path: 'https://evil.test/x', reason: 'r' }] },
    ],
    [
      'a mutation path with whitespace',
      { allowedMutations: [{ method: 'POST', path: '/a b', reason: 'r' }] },
    ],
    [
      'a mutation path with a backslash',
      { allowedMutations: [{ method: 'POST', path: '/a\\b', reason: 'r' }] },
    ],
    ['a mutation without a reason', { allowedMutations: [{ method: 'POST', path: '/x', reason: '' }] }],
    ['a mutation method that is a read', { allowedMutations: [{ method: 'GET', path: '/x', reason: 'r' }] }],
    ['a restricted route that is not a path', { restrictedRoutes: ['admin'] }],
  ])('rejects %s', (_label, override) => {
    expect(SecurityAuthorizationSchema.safeParse({ ...baseAuthorization(), ...override }).success).toBe(
      false,
    );
  });
});

describe('SecurityFindingSchema', () => {
  it('accepts a complete finding', () => {
    expect(SecurityFindingSchema.safeParse(baseFinding()).success).toBe(true);
  });

  it.each([
    ['no steps', { steps: [] }],
    ['an unknown check class', { checkClass: 'xss' }],
    ['an unknown confidence', { confidence: 'certain' }],
    ['a negative request index', { requestIndexes: [-1] }],
    ['an empty remediation', { remediation: '' }],
  ])('rejects %s', (_label, override) => {
    expect(SecurityFindingSchema.safeParse({ ...baseFinding(), ...override }).success).toBe(false);
  });
});

describe('SecurityAuditResultSchema', () => {
  const base = {
    auditId: 'audit-1',
    environment: 'staging',
    startedAt: '2026-10-10T10:00:00Z',
    finishedAt: '2026-10-10T10:01:00Z',
    status: 'completed',
    checks: [{ checkClass: 'cookies', status: 'failed', findingIds: ['finding-1'] }],
    findings: [baseFinding()],
    requests: [
      { method: 'POST', url: 'https://staging.example.test/login', outcome: 'sent', status: 302 },
      {
        method: 'GET',
        url: 'https://other.example.test/',
        outcome: 'refused',
        reason: 'outside the allowlist',
      },
    ],
  };

  it('accepts an audit with sent and refused requests', () => {
    expect(SecurityAuditResultSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a partial audit that says why it stopped', () => {
    const parsed = SecurityAuditResultSchema.parse({
      ...base,
      status: 'partial',
      stoppedReason: 'request budget',
    });

    expect(parsed.stoppedReason).toBe('request budget');
  });

  it('rejects a status that is neither completed nor partial', () => {
    expect(SecurityAuditResultSchema.safeParse({ ...base, status: 'passed' }).success).toBe(false);
  });
});

describe('SECURITY_CHECK_CLASSES', () => {
  it('lists the eight classes of the development plan', () => {
    expect([...SECURITY_CHECK_CLASSES]).toEqual([
      'headers',
      'cookies',
      'cors',
      'csrf',
      'authz',
      'session',
      'encoding',
      'errors',
    ]);
  });
});
