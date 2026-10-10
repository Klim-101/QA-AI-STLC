// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import type { SecurityAuthorization } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import {
  assertSecurityAuthorized,
  runSecurityAuthorizationAdd,
  runSecurityAuthorizationApprove,
} from './security-authorization.js';

const PROJECT_ROOT = 'project';
const CONFIG_PATH = join(PROJECT_ROOT, '.qa', 'config.yaml');
const AUTHORIZATION_FILE = join(PROJECT_ROOT, 'security', 'authorization.json');

function configYaml(
  overrides: { readonly security?: string; readonly allowlist?: string; readonly baseUrl?: string } = {},
): string {
  return [
    'schemaVersion: 1',
    `testing: { e2e: undecided, api: undecided, a11y: undecided, security: ${overrides.security ?? 'in-scope'} }`,
    'environments:',
    `  staging: { baseUrl: "${overrides.baseUrl ?? 'https://staging.example.test/'}", allowlist: ${overrides.allowlist ?? '["staging.example.test"]'} }`,
    'identities:',
    '  member: { auth: cdp-attach, secret: QA_MEMBER_PASSWORD }',
    '  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
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
    checks: ['headers', 'cookies'],
    identities: [
      { name: 'member', role: 'low' },
      { name: 'admin', role: 'high' },
    ],
    prohibitedActions: ['brute force', 'denial of service'],
    allowedMutations: [],
    restrictedRoutes: ['/admin/users'],
    rateLimit: { requestsPerSecond: 2, maxRequests: 100 },
    createdAt: '2026-10-10T10:00:00Z',
    ...overrides,
  };
}

function contextWith(
  options: { readonly config?: string; readonly authorizationFile?: unknown } = {},
): EngineContext {
  const files: Record<string, string> = { [CONFIG_PATH]: options.config ?? configYaml() };
  if (options.authorizationFile !== undefined) {
    files[AUTHORIZATION_FILE] = JSON.stringify(options.authorizationFile);
  }
  return createFakeEngineContext({
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(files),
    clock: { now: () => new Date('2026-10-10T11:00:00Z') },
  });
}

async function registered(overrides: Partial<SecurityAuthorization> = {}): Promise<EngineContext> {
  const context = contextWith({ authorizationFile: authorization(overrides) });
  await runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' });
  return context;
}

describe('runSecurityAuthorizationAdd', () => {
  it('registers a valid authorization and reports what it covers', async () => {
    const context = contextWith({ authorizationFile: authorization() });

    const result = await runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' });

    expect(result).toEqual({
      authorizationPath: 'artifacts/security/authorization.json',
      checks: ['headers', 'cookies'],
      environment: 'staging',
    });
    await expect(
      context.fs.pathExists(join(PROJECT_ROOT, '.qa', 'artifacts', 'security', 'authorization.json')),
    ).resolves.toBe(true);
  });

  it('requires a path', async () => {
    await expect(runSecurityAuthorizationAdd(contextWith(), {})).rejects.toMatchObject({
      code: 'SECURITY_AUTHORIZATION_USAGE',
    });
  });

  it('rejects a file that does not exist', async () => {
    await expect(
      runSecurityAuthorizationAdd(contextWith(), { path: 'security/missing.json' }),
    ).rejects.toMatchObject({ code: 'SECURITY_AUTHORIZATION_FILE_NOT_FOUND' });
  });

  it('refuses when security testing is not in scope', async () => {
    const context = contextWith({
      config: configYaml({ security: 'out-of-scope' }),
      authorizationFile: authorization(),
    });

    await expect(
      runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' }),
    ).rejects.toMatchObject({ code: 'SECURITY_OUT_OF_SCOPE' });
  });

  it.each([
    [
      'an unknown environment',
      authorization({
        environment: {
          name: 'prod',
          baseUrl: 'https://staging.example.test/',
          allowlist: ['staging.example.test'],
        },
      }),
    ],
    [
      'another base URL',
      authorization({
        environment: {
          name: 'staging',
          baseUrl: 'https://other.example.test/',
          allowlist: ['staging.example.test'],
        },
      }),
    ],
    [
      'a wider allowlist',
      authorization({
        environment: {
          name: 'staging',
          baseUrl: 'https://staging.example.test/',
          allowlist: ['staging.example.test', 'evil.test'],
        },
      }),
    ],
    [
      'a narrower allowlist',
      authorization({
        environment: { name: 'staging', baseUrl: 'https://staging.example.test/', allowlist: ['other.test'] },
      }),
    ],
  ])('refuses an authorization for %s', async (_label, value) => {
    const context = contextWith({ authorizationFile: value });

    await expect(
      runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' }),
    ).rejects.toMatchObject({ code: 'SECURITY_AUTHORIZATION_ENVIRONMENT_MISMATCH' });
  });

  it('refuses an identity that is not configured', async () => {
    const context = contextWith({
      authorizationFile: authorization({ identities: [{ name: 'ghost', role: 'low' }] }),
    });

    await expect(
      runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' }),
    ).rejects.toMatchObject({ code: 'SECURITY_AUTHORIZATION_UNKNOWN_IDENTITY' });
  });
});

describe('runSecurityAuthorizationApprove', () => {
  it('requires an approver', async () => {
    await expect(runSecurityAuthorizationApprove(await registered(), {})).rejects.toMatchObject({
      code: 'SECURITY_AUTHORIZATION_APPROVE_USAGE',
    });
  });

  it('refuses when nothing is registered', async () => {
    await expect(
      runSecurityAuthorizationApprove(contextWith(), { approvedBy: 'operator' }),
    ).rejects.toMatchObject({ code: 'SECURITY_AUTHORIZATION_NOT_FOUND' });
  });

  it('records the approval, with its note, and reports a repeat as already approved', async () => {
    const context = await registered();

    const first = await runSecurityAuthorizationApprove(context, {
      approvedBy: 'operator',
      note: 'Staging only',
    });
    const second = await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });

    expect(first).toEqual({ wasAlreadyApproved: false });
    expect(second).toEqual({ wasAlreadyApproved: true });
  });
});

describe('assertSecurityAuthorized', () => {
  it('returns the authorization once it is approved', async () => {
    const context = await registered();
    await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });

    const result = await assertSecurityAuthorized(context);

    expect(result.checks).toEqual(['headers', 'cookies']);
    expect(result.environment.name).toBe('staging');
  });

  it('refuses to start when no authorization is registered', async () => {
    await expect(assertSecurityAuthorized(contextWith())).rejects.toMatchObject({
      code: 'SECURITY_NOT_AUTHORIZED',
      message: expect.stringContaining('No security audit authorization is registered') as unknown,
    });
  });

  it('refuses to start when the authorization was registered but never approved', async () => {
    await expect(assertSecurityAuthorized(await registered())).rejects.toMatchObject({
      code: 'SECURITY_NOT_AUTHORIZED',
      message: expect.stringContaining('not approved') as unknown,
    });
  });

  it('withdraws the consent when a wider authorization is registered after approval', async () => {
    const context = await registered();
    await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });
    await context.fs.writeFile(
      join(PROJECT_ROOT, 'security', 'authorization.json'),
      JSON.stringify(authorization({ checks: ['headers', 'cookies', 'csrf'] })),
    );
    await runSecurityAuthorizationAdd(context, { path: 'security/authorization.json' });

    await expect(assertSecurityAuthorized(context)).rejects.toMatchObject({
      code: 'SECURITY_NOT_AUTHORIZED',
    });
  });

  it('refuses an authorization edited on disk behind the engine, approved or not', async () => {
    const context = await registered();
    await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });
    await context.fs.writeFile(
      join(PROJECT_ROOT, '.qa', 'artifacts', 'security', 'authorization.json'),
      JSON.stringify(authorization({ checks: ['headers', 'cookies', 'csrf'] })),
    );

    await expect(assertSecurityAuthorized(context)).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
  });

  it('refuses when the allowlist changed after approval', async () => {
    const context = await registered();
    await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });
    await context.fs.writeFile(
      CONFIG_PATH,
      configYaml({ allowlist: '["staging.example.test", "other.example.test"]' }),
    );

    await expect(assertSecurityAuthorized(context)).rejects.toMatchObject({
      code: 'SECURITY_AUTHORIZATION_STALE',
    });
  });

  it('refuses when security testing is no longer in scope', async () => {
    const context = await registered();
    await runSecurityAuthorizationApprove(context, { approvedBy: 'operator' });
    await context.fs.writeFile(CONFIG_PATH, configYaml({ security: 'out-of-scope' }));

    await expect(assertSecurityAuthorized(context)).rejects.toMatchObject({ code: 'SECURITY_OUT_OF_SCOPE' });
  });
});
