// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { noopLogger, type EngineContext, type StorageState } from '@qa-ai-stlc/core';
import type { SecurityAuthorization } from '@qa-ai-stlc/schemas';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import {
  IdentitySessions,
  NO_IDENTITY_SESSIONS,
  openIdentitySessions,
  toIdentitySession,
} from './identity-sessions.js';
import { authorizationFor, identitySession, sessionsOf } from './test-support/scripted-probe.js';

const NOW_MS = Date.parse('2026-10-11T12:00:00Z');
const NOW_SECONDS = NOW_MS / 1000;

type Cookie = StorageState['cookies'][number];

function cookie(overrides: Partial<Cookie> = {}): Cookie {
  return {
    name: 'sid',
    value: 'secret-value',
    domain: 'app.example.test',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
    ...overrides,
  };
}

function stateOf(...cookies: Cookie[]): StorageState {
  return { cookies, origins: [] };
}

describe('IdentitySessions', () => {
  it('lists the sessions and finds the first of a role', () => {
    const sessions = sessionsOf([
      identitySession('a', 'high'),
      identitySession('b', 'low'),
      identitySession('c', 'low'),
    ]);

    expect(sessions.all().map((session) => session.name)).toEqual(['a', 'b', 'c']);
    expect(sessions.byRole('low')?.name).toBe('b');
    expect(sessionsOf([identitySession('a', 'high')]).byRole('low')).toBeUndefined();
  });

  it('describes the identities that could not sign in, and nothing when all did', () => {
    expect(NO_IDENTITY_SESSIONS.describeFailures()).toBeUndefined();
    expect(
      new IdentitySessions(
        new Map(),
        new Map([
          ['a', 'no secret'],
          ['b', 'bad login'],
        ]),
      ).describeFailures(),
    ).toBe('a: no secret; b: bad login');
  });
});

describe('toIdentitySession', () => {
  const baseUrl = 'https://app.example.test/';

  it('keeps the cookies that apply to the host and maps their flags', () => {
    const session = toIdentitySession(
      'member',
      'low',
      stateOf(
        cookie({ name: 'a', httpOnly: true, secure: true, sameSite: 'Strict' }),
        cookie({ name: 'b', domain: '.example.test', sameSite: 'None' }),
        cookie({ name: 'c', domain: 'other.test' }),
      ),
      baseUrl,
      NOW_MS,
    );

    expect(session.cookies).toEqual([
      { name: 'a', isHttpOnly: true, isSecure: true, sameSite: 'strict' },
      { name: 'b', isHttpOnly: false, isSecure: false, sameSite: 'none' },
    ]);
    expect(session.cookieHeader).toBe('a=secret-value; b=secret-value');
  });

  it('drops a cookie that expired, and keeps one that is still valid or lasts for the session', () => {
    const session = toIdentitySession(
      'member',
      'low',
      stateOf(
        cookie({ name: 'old', expires: NOW_SECONDS - 10 }),
        cookie({ name: 'fresh', expires: NOW_SECONDS + 3600 }),
        cookie({ name: 'session', expires: -1 }),
      ),
      baseUrl,
      NOW_MS,
    );

    expect(session.cookies.map((flags) => flags.name)).toEqual(['fresh', 'session']);
  });

  it('does not match a host that merely ends with the cookie domain', () => {
    const session = toIdentitySession(
      'm',
      'low',
      stateOf(cookie({ domain: 'example.test' })),
      'https://notexample.test/',
      NOW_MS,
    );

    expect(session.cookies).toEqual([]);
  });

  it('yields an empty header for a state with no cookie', () => {
    expect(toIdentitySession('m', 'low', stateOf(), baseUrl, NOW_MS).cookieHeader).toBe('');
  });
});

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: in-scope }',
  'environments:',
  '  staging: { baseUrl: "https://app.example.test/", allowlist: ["app.example.test"] }',
  '  loose: { baseUrl: "https://loose.example.test/", allowlist: ["loose.example.test"], tlsInsecure: true }',
  'identities:',
  '  member: { auth: cdp-attach, secret: QA_MEMBER_PASSWORD }',
  '  admin: { auth: storage-state, secret: QA_ADMIN_PASSWORD, loginUrl: "https://app.example.test/login", username: admin }',
  '  outside: { auth: storage-state, secret: QA_OUTSIDE_PASSWORD, loginUrl: "https://elsewhere.example.test/login", username: outside }',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function contextWith(
  options: {
    readonly files?: Record<string, string>;
    readonly env?: Record<string, string>;
    readonly storageState?: StorageState;
  } = {},
) {
  const launcher = createFakeBrowserLauncher(
    options.storageState === undefined ? {} : { storageState: options.storageState },
  );
  const errors: unknown[] = [];
  const context: EngineContext = {
    projectRoot: 'project',
    fs: createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML, ...options.files }),
    clock: { now: () => new Date(NOW_MS) },
    logger: { ...noopLogger, error: (...args: unknown[]) => void errors.push(args) },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: launcher,
    env: options.env ?? {},
  };
  return { context, launcher, errors };
}

function authorization(
  identities: SecurityAuthorization['identities'],
  environment = 'staging',
): SecurityAuthorization {
  const base = authorizationFor('https://app.example.test/', { identities });
  return environment === 'staging'
    ? base
    : {
        ...base,
        environment: {
          name: environment,
          baseUrl: 'https://loose.example.test/',
          allowlist: ['loose.example.test'],
        },
      };
}

describe('openIdentitySessions', () => {
  it('uses a supplied storage state for each identity and its role', async () => {
    const { context } = contextWith();

    const sessions = await openIdentitySessions(context, authorization([{ name: 'member', role: 'low' }]), {
      storageStateFor: () => Promise.resolve(stateOf(cookie({ name: 'sid', httpOnly: true }))),
    });

    expect(sessions.byRole('low')?.cookies).toEqual([
      { name: 'sid', isHttpOnly: true, isSecure: false, sameSite: 'lax' },
    ]);
    expect(sessions.describeFailures()).toBeUndefined();
  });

  it('loads the storage state saved for the identity under .qa/auth', async () => {
    const { context } = contextWith({
      files: {
        [join('project', '.qa', 'auth', 'member.json')]: JSON.stringify(stateOf(cookie({ name: 'saved' }))),
      },
    });

    const sessions = await openIdentitySessions(context, authorization([{ name: 'member', role: 'low' }]));

    expect(sessions.all()[0]?.cookies.map((flags) => flags.name)).toEqual(['saved']);
  });

  it('signs a scripted identity in through the browser when nothing is saved', async () => {
    const { context, launcher } = contextWith({
      env: { QA_ADMIN_PASSWORD: 'admin-password' },
      storageState: stateOf(cookie({ name: 'fresh' })),
    });

    const sessions = await openIdentitySessions(context, authorization([{ name: 'admin', role: 'high' }]));

    expect(sessions.byRole('high')?.cookies.map((flags) => flags.name)).toEqual(['fresh']);
    expect(launcher.newContextCalls).toEqual([{}]);
  });

  it('turns certificate validation off for the sign-in only when the environment says so', async () => {
    const { context, launcher } = contextWith({
      env: { QA_ADMIN_PASSWORD: 'admin-password' },
      files: {
        [join('project', '.qa', 'config.yaml')]: CONFIG_YAML.replace(
          'loginUrl: "https://app.example.test/login"',
          'loginUrl: "https://loose.example.test/login"',
        ),
      },
    });

    await openIdentitySessions(context, authorization([{ name: 'admin', role: 'high' }], 'loose'));

    expect(launcher.newContextCalls).toEqual([{ ignoreHttpsErrors: true }]);
  });

  it('attaches to the browser the operator named for a cdp-attach identity', async () => {
    const { context } = contextWith();
    const attached = createFakeBrowserLauncher({
      contexts: [{ storageState: () => Promise.resolve(stateOf(cookie({ name: 'attached' }))) } as never],
    });

    const sessions = await openIdentitySessions(
      { ...context, browserLauncher: attached },
      authorization([{ name: 'member', role: 'low' }]),
      {
        cdpEndpointUrls: { member: 'http://127.0.0.1:9222' },
      },
    );

    expect(sessions.all()[0]?.cookies.map((flags) => flags.name)).toEqual(['attached']);
  });

  it.each([
    [
      'an identity that is not configured',
      [{ name: 'ghost', role: 'low' as const }],
      'not a configured identity',
      {},
    ],
    [
      'a cdp-attach identity with no endpoint',
      [{ name: 'member', role: 'low' as const }],
      'No CDP endpoint',
      {},
    ],
    [
      'a scripted identity with no secret',
      [{ name: 'admin', role: 'high' as const }],
      'QA_ADMIN_PASSWORD',
      {},
    ],
  ])('reports %s instead of failing the audit', async (_label, identities, message, env) => {
    const { context, errors } = contextWith({ env });

    const sessions = await openIdentitySessions(context, authorization(identities));

    expect(sessions.all()).toEqual([]);
    expect(sessions.describeFailures()).toContain(message);
    expect(errors).toHaveLength(1);
  });

  it('refuses to sign in through a page outside the authorized origin, and starts no browser', async () => {
    const { context, launcher } = contextWith({ env: { QA_OUTSIDE_PASSWORD: 'x' } });

    const sessions = await openIdentitySessions(context, authorization([{ name: 'outside', role: 'low' }]));

    expect(sessions.describeFailures()).toContain('outside the authorized origin');
    expect(launcher.newContextCalls).toEqual([]);
  });

  it('keeps signing in the other identities when one fails', async () => {
    const { context } = contextWith();

    const sessions = await openIdentitySessions(
      context,
      authorization([
        { name: 'ghost', role: 'low' },
        { name: 'member', role: 'high' },
      ]),
      { storageStateFor: (name) => Promise.resolve(name === 'member' ? stateOf(cookie()) : undefined) },
    );

    expect(sessions.all().map((session) => session.name)).toEqual(['member']);
    expect(sessions.describeFailures()).toContain('ghost');
  });

  it('rethrows an error that is not an engine error', async () => {
    const { context } = contextWith();

    await expect(
      openIdentitySessions(context, authorization([{ name: 'member', role: 'low' }]), {
        storageStateFor: () => Promise.reject(new TypeError('a bug')),
      }),
    ).rejects.toThrow('a bug');
  });
});
