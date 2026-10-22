// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import type { BrowserLauncher, StorageState } from './ports/browser-launcher.js';
import { signInForRun } from './run-sign-in.js';
import { createFakeEngineContext } from './test-support/fake-engine-context.js';

const SESSION: StorageState = {
  cookies: [
    {
      name: 'session',
      value: 'abc',
      domain: 'staging.example.test',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ],
  origins: [],
};

const TESTER_LINE =
  '  tester: { auth: storage-state, secret: QA_TESTER_PASSWORD, loginUrl: "https://staging.example.test/login", username: "tester@example.test" }';

function configYaml(identityLines: readonly string[]): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"], tlsInsecure: true }',
    '  plain: { baseUrl: "https://plain.example.test/", allowlist: ["plain.example.test"] }',
    '  spanish: { baseUrl: "https://spanish.example.test/", allowlist: ["spanish.example.test"], locale: es-ES }',
    'identities:',
    ...identityLines,
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

function createEngine(
  options: {
    readonly identityLines?: readonly string[];
    readonly launcher?: BrowserLauncher;
    readonly env?: Record<string, string>;
  } = {},
): ReturnType<typeof createFakeEngineContext> {
  return createFakeEngineContext({
    fs: createFakeFileSystem({
      [join('project', '.qa', 'config.yaml')]: configYaml(options.identityLines ?? [TESTER_LINE]),
    }),
    browserLauncher: options.launcher ?? createFakeBrowserLauncher({ storageState: SESSION }),
    env: options.env ?? { QA_TESTER_PASSWORD: 'hunter2' },
  });
}

async function failureOf(promise: Promise<unknown>): Promise<QaError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(QaError);
  return error as QaError;
}

describe('signInForRun', () => {
  it('returns the storage state the identity mechanism produced', async () => {
    await expect(signInForRun(createEngine(), 'tester', 'staging')).resolves.toBe(SESSION);
  });

  it('logs in with the environment TLS setting', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });

    await signInForRun(createEngine({ launcher }), 'tester', 'staging');

    expect(launcher.newContextCalls).toEqual([{ ignoreHttpsErrors: true }]);
  });

  it('signs in against an environment that does not relax TLS', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });
    const engine = createEngine({
      launcher,
      identityLines: [
        '  plainuser: { auth: storage-state, secret: QA_TESTER_PASSWORD, loginUrl: "https://plain.example.test/login", username: "tester@example.test" }',
      ],
    });

    await signInForRun(engine, 'plainuser', 'plain');

    expect(launcher.newContextCalls).toEqual([{}]);
  });

  it('logs in with the environment locale (P6-114)', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });
    const engine = createEngine({
      launcher,
      identityLines: [
        '  spanishuser: { auth: storage-state, secret: QA_TESTER_PASSWORD, loginUrl: "https://spanish.example.test/login", username: "tester@example.test" }',
      ],
    });

    await signInForRun(engine, 'spanishuser', 'spanish');

    expect(launcher.newContextCalls).toEqual([{ locale: 'es-ES' }]);
  });

  it('rejects an unknown identity', async () => {
    const error = await failureOf(signInForRun(createEngine(), 'ghost', 'staging'));

    expect(error.code).toBe('RUN_IDENTITY_UNKNOWN');
    expect(error.remediation).toContain('tester');
  });

  it('says so when the configuration defines no identity', async () => {
    const error = await failureOf(
      signInForRun(createEngine({ identityLines: ['  {}'] }), 'ghost', 'staging'),
    );

    expect(error.remediation).toContain('(none configured)');
  });

  it('rejects a cdp-attach identity, which a spec run cannot attach to', async () => {
    const engine = createEngine({
      identityLines: ['  attached: { auth: cdp-attach, secret: QA_TESTER_PASSWORD }'],
    });

    const error = await failureOf(signInForRun(engine, 'attached', 'staging'));

    expect(error.code).toBe('RUN_IDENTITY_UNSUPPORTED');
  });

  it('refuses to send the password to a login page the environment does not admit', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });

    await failureOf(signInForRun(createEngine({ launcher }), 'tester', 'plain'));

    expect(launcher.pageCalls).toEqual([]);
  });

  it('passes a missing password through as its own coded error', async () => {
    const error = await failureOf(signInForRun(createEngine({ env: {} }), 'tester', 'staging'));

    expect(error.code).toBe('IDENTITY_SECRET_MISSING');
  });

  it('converts a failure of the login itself to RUN_SIGN_IN_FAILED, keeping the cause', async () => {
    const cause = new Error('net::ERR_CONNECTION_REFUSED');
    const launcher: BrowserLauncher = {
      ...createFakeBrowserLauncher({ storageState: SESSION }),
      launch: () => Promise.reject(cause),
    };

    const error = await failureOf(signInForRun(createEngine({ launcher }), 'tester', 'staging'));

    expect(error.code).toBe('RUN_SIGN_IN_FAILED');
    expect(error.cause).toBe(cause);
  });

  it('fails when the login produced no session, instead of letting specs run against the login page', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: { cookies: [], origins: [] } });

    const error = await failureOf(signInForRun(createEngine({ launcher }), 'tester', 'staging'));

    expect(error.code).toBe('RUN_SIGN_IN_FAILED');
    expect(error.remediation).toContain('QA_TESTER_PASSWORD');
  });

  it('accepts a session that only holds local storage', async () => {
    const state: StorageState = {
      cookies: [],
      origins: [{ origin: 'https://staging.example.test', localStorage: [{ name: 'token', value: 'x' }] }],
    };
    const launcher = createFakeBrowserLauncher({ storageState: state });

    await expect(signInForRun(createEngine({ launcher }), 'tester', 'staging')).resolves.toBe(state);
  });
});
