// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import type { QaError } from '../errors.js';
import type { RouteRequest } from '../ports/browser-launcher.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  BROWSER_TEST_PROJECT_ROOT,
  createBrowserTestHarness,
  type BrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserOpen } from './browser-open.js';
import { runHttpExecute } from './http-execute.js';

const URL_ON_ALLOWLIST = 'https://staging.example.test/api';

const CONFIG_YAML = `${BROWSER_TEST_CONFIG_YAML}apiAuth:
  profiles:
    fromCookie: { type: from-browser, source: { kind: cookie, name: api_token } }
    fromLocal: { type: from-browser, source: { kind: local-storage, key: auth, jsonPath: token.access } }
    fromSession: { type: from-browser, source: { kind: session-storage, key: sessionToken } }
    fromHeader: { type: from-browser, source: { kind: request-header, header: X-Auth-Token } }
`;

const STORAGE_STATE = {
  cookies: [{ name: 'api_token', value: 'cookie-tok-1', domain: 'staging.example.test' }],
  origins: [
    {
      origin: 'https://staging.example.test',
      localStorage: [{ name: 'auth', value: '{"token":{"access":"local-tok-2"}}' }],
    },
  ],
};

interface Sent {
  readonly url: string;
  readonly options: Parameters<EngineContext['httpClient']['request']>[1];
}

// Echoes back whatever credential it was sent, the way a misbehaving API might.
function createHarness(): {
  readonly harness: BrowserTestHarness;
  readonly engine: EngineContext;
  readonly sent: Sent[];
} {
  const harness = createBrowserTestHarness({
    configYaml: CONFIG_YAML,
    launcherOptions: {
      storageState: STORAGE_STATE,
      evaluateResult: 'session-tok-3',
      initialUrl: 'https://staging.example.test/app',
    },
  });
  const sent: Sent[] = [];
  const engine: EngineContext = {
    ...harness.context.engine,
    httpClient: {
      get: () => Promise.reject(new Error('get() is not used')),
      request: (url, options) => {
        sent.push({ url, options });
        const echoed = Object.values(options?.headers ?? {}).join(' ');
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { 'x-echo': echoed },
          bodyText: `you sent ${echoed}`,
        });
      },
    },
  };
  return { harness, engine, sent };
}

async function observeHeader(harness: BrowserTestHarness): Promise<void> {
  const handler = harness.launcher.pageCalls.find((call) => call.method === 'route')?.args[1] as (route: {
    request: () => RouteRequest;
    abort: () => Promise<void>;
    continue: () => Promise<void>;
  }) => Promise<void>;
  await handler({
    request: () => ({
      method: () => 'GET',
      url: () => URL_ON_ALLOWLIST,
      allHeaders: () => Promise.resolve({ 'X-Auth-Token': 'header-tok-4' }),
    }),
    abort: () => Promise.resolve(),
    continue: () => Promise.resolve(),
  });
}

function evidenceText(harness: BrowserTestHarness, evidencePath: string): string {
  return String(harness.fs.getRawFile(join(BROWSER_TEST_PROJECT_ROOT, '.qa', evidencePath)));
}

describe('runHttpExecute with a from-browser profile and a live session', () => {
  it.each([
    ['fromCookie', 'Authorization', 'Bearer cookie-tok-1'],
    ['fromLocal', 'Authorization', 'Bearer local-tok-2'],
    ['fromSession', 'Authorization', 'Bearer session-tok-3'],
    ['fromHeader', 'X-Auth-Token', 'header-tok-4'],
  ])('reads the %s source and never stores any token', async (auth, headerName, headerValue) => {
    const { harness, engine, sent } = createHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await observeHeader(harness);

    const result = await runHttpExecute(engine, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      auth,
      browserSessionId: sessionId,
      sessions: harness.sessions,
    });

    expect(sent[0]?.options?.headers).toEqual({ [headerName]: headerValue });
    expect(sent[0]?.options?.redirect).toBe('manual');
    const record = evidenceText(harness, result.evidence.path);
    expect(record).not.toMatch(/-tok-/u);
    expect(record).toContain('you sent');
  });

  it('reads the token again on every call, so a rotated token is picked up', async () => {
    const { harness, engine, sent } = createHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    const call = () =>
      runHttpExecute(engine, {
        runId: 'run-1',
        url: URL_ON_ALLOWLIST,
        auth: 'fromHeader',
        browserSessionId: sessionId,
        sessions: harness.sessions,
      });

    await observeHeader(harness);
    await call();
    const rotated = harness.launcher.pageCalls.find((entry) => entry.method === 'route')?.args[1] as (
      route: unknown,
    ) => Promise<void>;
    await rotated({
      request: () => ({
        method: () => 'GET',
        url: () => URL_ON_ALLOWLIST,
        allHeaders: () => Promise.resolve({ 'X-Auth-Token': 'rotated' }),
      }),
      abort: () => Promise.resolve(),
      continue: () => Promise.resolve(),
    });
    await call();

    expect(sent.map((entry) => entry.options?.headers)).toEqual([
      { 'X-Auth-Token': 'header-tok-4' },
      { 'X-Auth-Token': 'rotated' },
    ]);
  });

  it('fails with a code, and makes no request, when no session or identity is given', async () => {
    const { engine, sent } = createHarness();

    const error = (await runHttpExecute(engine, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      auth: 'fromCookie',
    }).catch((caught: unknown) => caught)) as QaError;

    expect(error.code).toBe('API_AUTH_SESSION_REQUIRED');
    expect(sent).toHaveLength(0);
  });

  it('does not read a session at all for a profile that does not need one', async () => {
    const { engine, sent } = createHarness();

    await runHttpExecute(engine, { runId: 'run-1', url: URL_ON_ALLOWLIST, headers: { Accept: 'json' } });

    expect(sent).toHaveLength(1);
  });
});

describe('runHttpExecute with a from-browser profile and a saved identity', () => {
  it('reads a cookie or localStorage value, and refuses the two sources a storage state cannot hold', async () => {
    const { harness, engine, sent } = createHarness();
    await harness.fs.writeFile(
      join(BROWSER_TEST_PROJECT_ROOT, '.qa', 'auth', 'admin.json'),
      JSON.stringify(STORAGE_STATE),
    );
    const call = (auth: string) =>
      runHttpExecute(engine, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth, identity: 'admin' });

    await call('fromCookie');
    await call('fromLocal');
    const sessionStorageError = (await call('fromSession').catch((caught: unknown) => caught)) as QaError;
    const headerError = (await call('fromHeader').catch((caught: unknown) => caught)) as QaError;

    expect(sent.map((entry) => entry.options?.headers)).toEqual([
      { Authorization: 'Bearer cookie-tok-1' },
      { Authorization: 'Bearer local-tok-2' },
    ]);
    expect([sessionStorageError.code, headerError.code]).toEqual([
      'API_AUTH_SOURCE_UNSUPPORTED',
      'API_AUTH_SOURCE_UNSUPPORTED',
    ]);
  });

  it('rejects a raw header that any from-browser profile would set', async () => {
    const { engine, sent } = createHarness();

    const error = (await runHttpExecute(engine, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      headers: { 'x-auth-token': 'typed-by-hand' },
    }).catch((caught: unknown) => caught)) as QaError;

    expect(error.code).toBe('HTTP_CREDENTIAL_INPUT_REJECTED');
    expect(sent).toHaveLength(0);
  });
});
