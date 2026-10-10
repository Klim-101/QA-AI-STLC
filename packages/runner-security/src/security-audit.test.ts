// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  noopLogger,
  runSecurityAuthorizationAdd,
  runSecurityAuthorizationApprove,
  type EngineContext,
  type HttpClient,
  type IdGenerator,
} from '@qa-ai-stlc/core';
import type { SecurityAuthorization, SecurityCheckClass, SecurityFinding } from '@qa-ai-stlc/schemas';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import { runSecurityAudit } from './security-audit.js';
import type { SecurityCheck, SecurityCheckInput, SecurityCheckOutcome } from './security-check.js';

const PROJECT_ROOT = 'project';
const CONFIG_PATH = join(PROJECT_ROOT, '.qa', 'config.yaml');
const NOW = new Date('2026-10-10T11:00:00Z');

function configYaml(environmentExtras = ''): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: in-scope }',
    'environments:',
    `  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"]${environmentExtras} }`,
    'identities:',
    '  member: { auth: cdp-attach, secret: QA_MEMBER_PASSWORD }',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

function authorization(overrides: Partial<SecurityAuthorization> = {}): SecurityAuthorization {
  return {
    schemaVersion: 1,
    environment: {
      name: 'staging',
      baseUrl: 'https://staging.example.test/',
      allowlist: ['staging.example.test'],
    },
    checks: ['headers', 'cookies', 'errors'],
    identities: [{ name: 'member', role: 'low' }],
    prohibitedActions: ['brute force', 'denial of service'],
    allowedMutations: [],
    restrictedRoutes: [],
    rateLimit: { requestsPerSecond: 1000, maxRequests: 50 },
    createdAt: '2026-10-10T10:00:00Z',
    ...overrides,
  };
}

interface Harness {
  readonly context: EngineContext;
  readonly requestedUrls: string[];
  readonly clientOptions: unknown[];
}

async function harness(
  options: {
    readonly authorizationValue?: SecurityAuthorization;
    readonly isApproved?: boolean;
    readonly environmentExtras?: string;
  } = {},
): Promise<Harness> {
  const requestedUrls: string[] = [];
  const clientOptions: unknown[] = [];
  const httpClient: HttpClient = {
    get: () => Promise.reject(new Error('get() is not used')),
    request: (url, requestOptions) => {
      requestedUrls.push(url);
      clientOptions.push(requestOptions);
      return Promise.resolve({ ok: true, status: 200, headers: {}, setCookies: [], bodyText: '' });
    },
  };
  const context: EngineContext = {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [CONFIG_PATH]: configYaml(options.environmentExtras),
      [join(PROJECT_ROOT, 'security', 'authorization.json')]: JSON.stringify(
        options.authorizationValue ?? authorization(),
      ),
    }),
    clock: { now: () => NOW },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient,
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
  await runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' });
  if (options.isApproved !== false) {
    await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });
  }
  return { context, requestedUrls, clientOptions };
}

function sequentialIds(): IdGenerator {
  let next = 0;
  return {
    next: () => {
      next += 1;
      return String(next);
    },
  };
}

function finding(
  checkClass: SecurityCheckClass,
  id: string,
  overrides: Partial<SecurityFinding> = {},
): SecurityFinding {
  return {
    id,
    checkClass,
    riskArea: 'Session management',
    confidence: 'high',
    severityProposal: 'major',
    title: 'Session cookie is readable from scripts',
    steps: ['Request the sign-in page', 'Read the Set-Cookie header'],
    expectedResult: 'The session cookie carries HttpOnly',
    actualResult: 'The session cookie has no HttpOnly attribute',
    remediation: 'Set HttpOnly on the session cookie',
    regressionCheck: 'Assert the response sets HttpOnly',
    requestIndexes: [0],
    ...overrides,
  };
}

function check(
  checkClass: SecurityCheckClass,
  run: (input: SecurityCheckInput) => Promise<SecurityCheckOutcome>,
): SecurityCheck {
  return { checkClass, run };
}

const PASSING: SecurityCheckOutcome = { status: 'passed', findings: [] };

describe('runSecurityAudit authorization', () => {
  it('refuses to start without an approved authorization, and sends nothing', async () => {
    const { context, requestedUrls } = await harness({ isApproved: false });
    let ran = false;

    await expect(
      runSecurityAudit(context, {
        checks: [
          check('headers', () => {
            ran = true;
            return Promise.resolve(PASSING);
          }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'SECURITY_NOT_AUTHORIZED' });

    expect(ran).toBe(false);
    expect(requestedUrls).toEqual([]);
  });

  it('refuses once the allowlist changed after approval', async () => {
    const { context } = await harness();
    await context.fs.writeFile(
      CONFIG_PATH,
      configYaml().replace('["staging.example.test"]', '["staging.example.test", "x.test"]'),
    );

    await expect(runSecurityAudit(context, { checks: [] })).rejects.toMatchObject({
      code: 'SECURITY_AUTHORIZATION_STALE',
    });
  });
});

describe('runSecurityAudit checks', () => {
  it('marks an authorized check this version cannot run as skipped, never passed', async () => {
    const { context } = await harness();

    const { result, drafts } = await runSecurityAudit(context, { checks: [], idGenerator: sequentialIds() });

    expect(result.status).toBe('completed');
    expect(result.checks.map((entry) => [entry.checkClass, entry.status])).toEqual([
      ['headers', 'skipped'],
      ['cookies', 'skipped'],
      ['errors', 'skipped'],
    ]);
    expect(result.checks[0]?.note).toContain('no implementation');
    expect(drafts).toEqual([]);
  });

  it('runs only the classes the authorization names, in the plan order', async () => {
    const { context } = await harness({
      authorizationValue: authorization({ checks: ['errors', 'headers'] }),
    });
    const ran: string[] = [];
    const record = (checkClass: SecurityCheckClass) =>
      check(checkClass, () => {
        ran.push(checkClass);
        return Promise.resolve(PASSING);
      });

    await runSecurityAudit(context, { checks: [record('cookies'), record('errors'), record('headers')] });

    expect(ran).toEqual(['headers', 'errors']);
  });

  it('reports a check that looked and found nothing as passed, keeping its note', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['headers'] }) });

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('headers', () =>
          Promise.resolve({ status: 'passed', note: 'Looked at 3 pages', findings: [] }),
        ),
      ],
    });

    expect(result.checks).toEqual([
      { checkClass: 'headers', status: 'passed', note: 'Looked at 3 pages', findingIds: [] },
    ]);
  });

  it.each(['skipped', 'blocked', 'uncertain'] as const)(
    'keeps a check reported %s as it is',
    async (status) => {
      const { context } = await harness({ authorizationValue: authorization({ checks: ['headers'] }) });

      const { result } = await runSecurityAudit(context, {
        checks: [check('headers', () => Promise.resolve({ status, findings: [] }))],
      });

      expect(result.checks[0]?.status).toBe(status);
    },
  );

  it('makes a check failed whenever it returns a finding, whatever status it claims', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['cookies'] }) });

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('cookies', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/login' });
          return { status: 'passed', findings: [finding('cookies', 'cookie-1')] };
        }),
      ],
    });

    expect(result.checks[0]).toMatchObject({ status: 'failed', findingIds: ['cookie-1'] });
  });
});

describe('runSecurityAudit findings', () => {
  it('registers the audit as evidence and drafts one security defect per finding', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['cookies'] }) });

    const outcome = await runSecurityAudit(context, {
      idGenerator: sequentialIds(),
      checks: [
        check('cookies', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/login' });
          return { status: 'passed', findings: [finding('cookies', 'cookie-1')] };
        }),
      ],
    });

    expect(outcome.evidencePath).toBe('evidence/security-audit-1/evidence-2.json');
    const stored = JSON.parse(
      await context.fs.readFile(join(PROJECT_ROOT, '.qa', ...outcome.evidencePath.split('/'))),
    ) as { auditId: string; requests: unknown[]; findings: unknown[] };
    expect(stored.auditId).toBe('audit-1');
    expect(stored.requests).toHaveLength(1);
    expect(stored.findings).toHaveLength(1);
    expect(outcome.drafts).toHaveLength(1);
    expect(outcome.drafts[0]).toMatchObject({
      id: 'security-cookie-1',
      category: 'security',
      status: 'draft',
      environment: 'staging',
      evidencePaths: [outcome.evidencePath],
      securityRiskArea: 'Session management',
      securityConfidence: 'high',
    });
  });

  it('turns a finding of the wrong class into a blocked check, not a finding', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['headers'] }) });

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('headers', () => Promise.resolve({ status: 'passed', findings: [finding('cookies', 'x-1')] })),
      ],
    });

    expect(result.findings).toEqual([]);
    expect(result.checks[0]).toMatchObject({ status: 'blocked' });
    expect(result.checks[0]?.note).toContain('of class "cookies"');
    expect(result.status).toBe('partial');
  });

  it('turns a reused finding id into a blocked check', async () => {
    const { context } = await harness({
      authorizationValue: authorization({ checks: ['headers', 'cookies'] }),
    });

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('headers', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/' });
          return { status: 'passed', findings: [finding('headers', 'dup')] };
        }),
        check('cookies', () => Promise.resolve({ status: 'passed', findings: [finding('cookies', 'dup')] })),
      ],
    });

    expect(result.checks.map((entry) => entry.status)).toEqual(['failed', 'blocked']);
    expect(result.findings).toHaveLength(1);
  });

  it('refuses an audit whose finding cites a request that was never made', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['headers'] }) });

    await expect(
      runSecurityAudit(context, {
        checks: [
          check('headers', () =>
            Promise.resolve({
              status: 'passed',
              findings: [finding('headers', 'h-1', { requestIndexes: [4] })],
            }),
          ),
        ],
      }),
    ).rejects.toMatchObject({ code: 'SECURITY_FINDING_INVALID' });
  });

  it('does not keep an audit result that would leak a secret', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['errors'] }) });

    await expect(
      runSecurityAudit(context, {
        checks: [
          check('errors', async ({ probe }) => {
            await probe.request({ method: 'GET', path: '/boom' });
            return {
              status: 'passed',
              findings: [
                finding('errors', 'e-1', { actualResult: 'The error page printed AKIAIOSFODNN7EXAMPLE' }),
              ],
            };
          }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'SECURITY_EVIDENCE_QUARANTINED' });
  });
});

describe('runSecurityAudit failures', () => {
  it('marks a check the probe stopped as blocked, keeps going, and calls the audit partial', async () => {
    const { context } = await harness({
      authorizationValue: authorization({ checks: ['headers', 'cookies'] }),
    });

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('headers', async ({ probe }) => {
          await probe.request({ method: 'DELETE', path: '/tasks/1' });
          return PASSING;
        }),
        check('cookies', () => Promise.resolve(PASSING)),
      ],
    });

    expect(result.checks.map((entry) => entry.status)).toEqual(['blocked', 'passed']);
    expect(result.checks[0]?.note).toContain('refused');
    expect(result.status).toBe('partial');
    expect(result.stoppedReason).toBeUndefined();
    expect(result.requests).toEqual([expect.objectContaining({ method: 'DELETE', outcome: 'refused' })]);
  });

  it('stops at the request budget: the check is blocked, the rest are not run, the audit is partial', async () => {
    const { context } = await harness({
      authorizationValue: authorization({
        checks: ['headers', 'cookies', 'errors'],
        rateLimit: { requestsPerSecond: 1000, maxRequests: 2 },
      }),
    });
    let laterCheckRan = false;

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('headers', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/1' });
          await probe.request({ method: 'GET', path: '/2' });
          await probe.request({ method: 'GET', path: '/3' });
          return PASSING;
        }),
        check('cookies', () => {
          laterCheckRan = true;
          return Promise.resolve(PASSING);
        }),
      ],
    });

    expect(laterCheckRan).toBe(false);
    expect(result.checks.map((entry) => entry.status)).toEqual(['blocked', 'skipped', 'skipped']);
    expect(result.checks[1]?.note).toBe('Not run: the authorized request budget was used up.');
    expect(result.status).toBe('partial');
    expect(result.stoppedReason).toBe('the authorized request budget was used up');
  });

  it('rethrows an error that is not an engine error instead of hiding a bug in a check', async () => {
    const { context } = await harness({ authorizationValue: authorization({ checks: ['headers'] }) });

    await expect(
      runSecurityAudit(context, {
        checks: [check('headers', () => Promise.reject(new TypeError('a bug in the check')))],
      }),
    ).rejects.toThrow('a bug in the check');
  });
});

describe('runSecurityAudit scope', () => {
  it('sends nothing outside the authorized origin, however a check asks', async () => {
    const { context, requestedUrls } = await harness({
      authorizationValue: authorization({ checks: ['headers'] }),
    });

    const { result } = await runSecurityAudit(context, {
      checks: [
        check('headers', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/' });
          for (const path of [
            'https://evil.example.test/x',
            '//evil.example.test/x',
            '/\\evil.example.test/x',
          ]) {
            await probe.request({ method: 'GET', path }).catch(() => undefined);
          }
          return PASSING;
        }),
      ],
    });

    expect(requestedUrls).toEqual(['https://staging.example.test/']);
    expect(result.requests.filter((entry) => entry.outcome === 'refused')).toHaveLength(3);
    expect(new Set(requestedUrls.map((url) => new URL(url).hostname))).toEqual(
      new Set(['staging.example.test']),
    );
  });

  it('passes the environment setting for certificate validation to the probe', async () => {
    const { context, clientOptions } = await harness({
      authorizationValue: authorization({ checks: ['headers'] }),
      environmentExtras: ', tlsInsecure: true',
    });

    await runSecurityAudit(context, {
      checks: [
        check('headers', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/' });
          return PASSING;
        }),
      ],
    });

    expect(clientOptions[0]).toMatchObject({ tlsInsecure: true });
  });

  it('honours an injected pause and request timeout', async () => {
    const { context, clientOptions } = await harness({
      authorizationValue: authorization({
        checks: ['headers'],
        rateLimit: { requestsPerSecond: 1, maxRequests: 10 },
      }),
    });
    const waits: number[] = [];

    await runSecurityAudit(context, {
      pause: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
      requestTimeoutMs: 1234,
      checks: [
        check('headers', async ({ probe }) => {
          await probe.request({ method: 'GET', path: '/1' });
          await probe.request({ method: 'GET', path: '/2' });
          return PASSING;
        }),
      ],
    });

    expect(waits).toHaveLength(1);
    expect(clientOptions).toHaveLength(2);
  });
});
