// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config-loader.js';
import { QaError } from './errors.js';
import type { RouteRequest, StorageState } from './ports/browser-launcher.js';
import { readBrowserToken } from './browser-token-source.js';
import { withRunTokenOrigin } from './run-token-origin.js';
import { createFakeEngineContext } from './test-support/fake-engine-context.js';

const SESSION: StorageState = {
  cookies: [
    {
      name: 'session',
      value: 'cookie-secret',
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

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"], identity: tester }',
  'identities:',
  '  tester: { auth: storage-state, secret: QA_TESTER_PASSWORD, loginUrl: "https://staging.example.test/login", username: "tester@example.test" }',
  'apiAuth:',
  '  profiles:',
  '    stage-api: { type: from-browser, source: { kind: request-header, header: Authorization } }',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function createEngine(yaml: string = CONFIG_YAML) {
  const launcher = createFakeBrowserLauncher({
    storageState: SESSION,
    evaluateResult: 'session-storage-secret',
  });
  const engine = createFakeEngineContext({
    fs: createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: yaml }),
    browserLauncher: launcher,
    env: { QA_TESTER_PASSWORD: 'hunter2' },
  });
  return { engine, launcher };
}

function routeFor(method: string, url: string, headers: Record<string, string>) {
  const calls: string[] = [];
  const request: RouteRequest = {
    method: () => method,
    url: () => url,
    allHeaders: () => Promise.resolve(headers),
  };
  return {
    calls,
    route: {
      request: () => request,
      continue: () => {
        calls.push('continue');
        return Promise.resolve();
      },
      abort: () => {
        calls.push('abort');
        return Promise.resolve();
      },
    },
  };
}

describe('withRunTokenOrigin', () => {
  it('reads a request header the application sends while it loads, from a headless session', async () => {
    const { engine, launcher } = createEngine();
    const config = await loadConfig(engine);

    const token = await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      async (origin) => {
        const handler = launcher.pageCalls.find((call) => call.method === 'contextRoute')?.args[1] as (
          route: unknown,
        ) => Promise<void>;
        const { route } = routeFor('GET', 'https://staging.example.test/api/node', {
          authorization: 'Bearer header-secret',
        });
        await handler(route);
        return readBrowserToken({ kind: 'request-header', header: 'Authorization' }, origin);
      },
    );

    expect(token.headerValue).toBe('Bearer header-secret');
    expect(launcher.closedBrowsers).toBe(2);
    expect(launcher.pageCalls.some((call) => call.method === 'goto')).toBe(true);
  });

  it('reads a sessionStorage key from the loaded page', async () => {
    const { engine } = createEngine();
    const config = await loadConfig(engine);

    const token = await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      (origin) => readBrowserToken({ kind: 'session-storage', key: 'token' }, origin),
    );

    expect(token.secretValues).toEqual(['session-storage-secret']);
  });

  it('reads a cookie the sign-in produced', async () => {
    const { engine } = createEngine();
    const config = await loadConfig(engine);

    const token = await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      (origin) => readBrowserToken({ kind: 'cookie', name: 'session' }, origin),
    );

    expect(token.secretValues).toEqual(['cookie-secret']);
  });

  it('puts the session under safe mode: a write is aborted, a read of the application goes through', async () => {
    const { engine, launcher } = createEngine();
    const config = await loadConfig(engine);

    await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      () => {
        const handler = launcher.pageCalls.find((call) => call.method === 'contextRoute')?.args[1] as (
          route: unknown,
        ) => Promise<void>;
        const post = routeFor('POST', 'https://staging.example.test/api/node', {});
        const get = routeFor('GET', 'https://staging.example.test/api/node', {});
        return Promise.all([handler(post.route), handler(get.route)]).then(() => {
          expect(post.calls).toEqual(['abort']);
          expect(get.calls).toEqual(['continue']);
        });
      },
    );
  });

  it('lets through a write the environment names exactly while the page loads (ADR-0014)', async () => {
    const yaml = CONFIG_YAML.replace(
      'identity: tester }',
      'identity: tester, safeNonGetRequests: [{ method: POST, path: /auth/refresh-token, reason: opens the session }] }',
    );
    const { engine, launcher } = createEngine(yaml);
    const config = await loadConfig(engine);

    await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      async () => {
        const handler = launcher.pageCalls.find((call) => call.method === 'contextRoute')?.args[1] as (
          route: unknown,
        ) => Promise<void>;
        const listed = routeFor('POST', 'https://staging.example.test/auth/refresh-token', {});
        const other = routeFor('POST', 'https://staging.example.test/orders', {});
        await handler(listed.route);
        await handler(other.route);
        expect(listed.calls).toEqual(['continue']);
        expect(other.calls).toEqual(['abort']);
      },
    );
  });

  it('closes the session when the callback throws', async () => {
    const { engine, launcher } = createEngine();
    const config = await loadConfig(engine);

    await expect(
      withRunTokenOrigin(
        engine,
        config,
        { environment: undefined, identity: 'tester', profileName: 'stage-api' },
        () => Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom');

    expect(launcher.closedBrowsers).toBe(2);
  });

  it('asks for an identity when the run has none, before any browser opens', async () => {
    const { engine, launcher } = createEngine();
    const config = await loadConfig(engine);

    const error = await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: undefined, profileName: 'stage-api' },
      () => Promise.resolve(undefined),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect(error).toMatchObject({ code: 'API_AUTH_SESSION_REQUIRED' });
    expect((error as QaError).remediation).toContain('identity');
    expect(launcher.closedBrowsers).toBe(0);
  });

  it('opens the session with the environment locale (P6-114)', async () => {
    const yaml = CONFIG_YAML.replace('identity: tester }', 'identity: tester, locale: es-ES }');
    const { engine, launcher } = createEngine(yaml);
    const config = await loadConfig(engine);

    await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      () => Promise.resolve(undefined),
    );

    expect(launcher.newContextCalls.at(-1)).toEqual(
      expect.objectContaining({ locale: 'es-ES', storageState: SESSION }),
    );
  });

  it('opens the session with the environment TLS setting', async () => {
    const yaml = CONFIG_YAML.replace('identity: tester }', 'identity: tester, tlsInsecure: true }');
    const { engine, launcher } = createEngine(yaml);
    const config = await loadConfig(engine);

    await withRunTokenOrigin(
      engine,
      config,
      { environment: undefined, identity: 'tester', profileName: 'stage-api' },
      () => Promise.resolve(undefined),
    );

    expect(launcher.newContextCalls.at(-1)).toEqual(
      expect.objectContaining({ ignoreHttpsErrors: true, storageState: SESSION }),
    );
  });
});
