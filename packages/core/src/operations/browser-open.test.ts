// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { ConfigSchema, type Config } from '@qa-ai-stlc/schemas';
import { describe, expect, it, vi } from 'vitest';
import type { AuthBrowser, AuthBrowserContext, LaunchOptions } from '../ports/browser-launcher.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { resolveBrowserEnvironment, runBrowserOpen } from './browser-open.js';

function configWithEnvironments(environments: Config['environments']): Config {
  return ConfigSchema.parse({
    testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
    environments,
    identities: {},
    data: { strategy: 'manual', ownerMarker: 'qa-ai-stlc' },
    selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid' },
    agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 },
  });
}

const STAGING = { baseUrl: 'https://staging.example.test/', allowlist: ['staging.example.test'] };

// A base URL carrying what looks like a JWT: the evidence store quarantines the record rather
// than writing it, and the operation must not hand back a session with no opening record.
const BROWSER_CONFIG_WITH_SECRET_IN_URL = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging:',
  '    baseUrl: "https://staging.example.test/?t=eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM"',
  '    allowlist: ["staging.example.test"]',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

describe('resolveBrowserEnvironment', () => {
  it('returns the only environment when none is named', () => {
    const resolved = resolveBrowserEnvironment(configWithEnvironments({ staging: STAGING }), undefined);

    expect(resolved.name).toBe('staging');
  });

  it('returns the named environment', () => {
    const config = configWithEnvironments({ staging: STAGING, prod: STAGING });

    expect(resolveBrowserEnvironment(config, 'prod').name).toBe('prod');
  });

  it('throws BROWSER_ENVIRONMENT_UNKNOWN for a name that is not configured', () => {
    expect(() => resolveBrowserEnvironment(configWithEnvironments({ staging: STAGING }), 'prod')).toThrow(
      expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_UNKNOWN' }) as Error,
    );
  });

  it('throws BROWSER_ENVIRONMENT_AMBIGUOUS when several exist and none is named', () => {
    const config = configWithEnvironments({ staging: STAGING, prod: STAGING });

    expect(() => resolveBrowserEnvironment(config, undefined)).toThrow(
      expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' }) as Error,
    );
  });

  it('throws BROWSER_ENVIRONMENT_AMBIGUOUS when the project configures none at all', () => {
    try {
      resolveBrowserEnvironment(configWithEnvironments({}), undefined);
      expect.unreachable('expected an empty environment map to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' });
      expect((error as { remediation?: string }).remediation).toContain('Add an environment');
    }
  });
});

const LOGIN_CONFIG_YAML = BROWSER_TEST_CONFIG_YAML.replace(
  'admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
  'admin: { auth: storage-state, secret: QA_ADMIN_PASSWORD, loginUrl: "https://staging.example.test/login", username: "qa.admin@example.test" }',
);
const SIGNED_IN_STATE = {
  cookies: [
    {
      name: 'session',
      value: 'opaque-session-value',
      domain: 'staging.example.test',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    },
  ],
  origins: [],
};

describe('runBrowserOpen with an identity (P6-74)', () => {
  function loginHarness(env: Record<string, string> = { QA_ADMIN_PASSWORD: 'placeholder-password' }) {
    const harness = createBrowserTestHarness({
      configYaml: LOGIN_CONFIG_YAML,
      launcherOptions: { storageState: SIGNED_IN_STATE },
    });
    return { ...harness, context: { ...harness.context, engine: { ...harness.context.engine, env } } };
  }

  it('seeds the session context with the identity storage state and names the identity', async () => {
    const harness = loginHarness();

    const result = await runBrowserOpen(harness.context, { identity: 'admin' });

    expect(harness.launcher.newContextCalls.at(-1)?.storageState).toEqual(SIGNED_IN_STATE);
    expect(result.identity).toBe('admin');
  });

  it('never puts the storage state in the result or the registered evidence', async () => {
    const harness = loginHarness();

    const result = await runBrowserOpen(harness.context, { identity: 'admin' });

    expect(JSON.stringify(result)).not.toContain('opaque-session-value');
    const written = harness.fs.getRawFile(join('project', '.qa', result.evidence.path));
    expect(String(written)).not.toContain('opaque-session-value');
  });

  it('starts anonymous, without an identity field, when none is given', async () => {
    const harness = loginHarness();

    const result = await runBrowserOpen(harness.context);

    expect(harness.launcher.newContextCalls.at(-1)?.storageState).toBeUndefined();
    expect(result).not.toHaveProperty('identity');
  });

  it('throws BROWSER_IDENTITY_UNKNOWN for an identity that is not configured, before launching a browser', async () => {
    const harness = loginHarness();

    await expect(runBrowserOpen(harness.context, { identity: 'nobody' })).rejects.toMatchObject({
      code: 'BROWSER_IDENTITY_UNKNOWN',
    });
    expect(harness.launcher.newContextCalls).toHaveLength(0);
    expect(harness.sessions.sessionIds).toEqual([]);
  });

  it('surfaces IDENTITY_SECRET_MISSING and opens no session', async () => {
    const harness = loginHarness({});

    await expect(runBrowserOpen(harness.context, { identity: 'admin' })).rejects.toMatchObject({
      code: 'IDENTITY_SECRET_MISSING',
    });
    expect(harness.sessions.sessionIds).toEqual([]);
  });

  it('signs in with the project default login selectors and ignores TLS errors for a tlsInsecure environment', async () => {
    const harness = createBrowserTestHarness({
      configYaml: LOGIN_CONFIG_YAML.replace(
        'allowlist: ["staging.example.test"] }',
        'allowlist: ["staging.example.test"], tlsInsecure: true }',
      ),
      launcherOptions: { storageState: SIGNED_IN_STATE },
    });
    const context = {
      ...harness.context,
      engine: { ...harness.context.engine, env: { QA_ADMIN_PASSWORD: 'x' } },
    };

    await runBrowserOpen(context, { identity: 'admin' });

    expect(harness.launcher.newContextCalls.map((call) => call.ignoreHttpsErrors)).toEqual([true, true]);
  });

  it('passes the CDP endpoint through for a cdp-attach identity', async () => {
    const attached: AuthBrowserContext = {
      newPage: () => Promise.reject(new Error('not used')),
      pages: () => [],
      storageState: () => Promise.resolve(SIGNED_IN_STATE),
      route: () => Promise.resolve(),
      on: () => undefined,
      close: () => Promise.resolve(),
    };
    const harness = createBrowserTestHarness({ launcherOptions: { contexts: [attached] } });

    await runBrowserOpen(harness.context, { identity: 'admin', cdpEndpointUrl: 'http://localhost:9222' });

    expect(harness.launcher.newContextCalls.at(-1)?.storageState).toEqual(SIGNED_IN_STATE);
  });
});

describe('runBrowserOpen', () => {
  it('merges the library profile and project busy selectors into the session, without repeats (P6-42)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { componentLibrary: kendo-jquery, busySelectors: [".app-spinner", ".k-loading-mask"] }
`,
    });
    const requestedLibraries: string[] = [];

    const { sessionId } = await runBrowserOpen(harness.context, {
      resolveLibraryBusySelectors: (library) => {
        requestedLibraries.push(library);
        return ['.k-loading-mask', '.k-loader'];
      },
    });

    expect(requestedLibraries).toEqual(['kendo-jquery']);
    expect((await harness.sessions.get(sessionId)).busySelectors).toEqual([
      '.k-loading-mask',
      '.k-loader',
      '.app-spinner',
    ]);
  });

  it('waits on the project busy selectors alone when no library lookup is supplied (P6-42)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".app-spinner"] }
`,
    });

    const { sessionId } = await runBrowserOpen(harness.context);

    expect((await harness.sessions.get(sessionId)).busySelectors).toEqual(['.app-spinner']);
  });

  it('gives the session the widgets the library lookup returns, and none without a lookup (P6-43)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { componentLibrary: kendo-jquery }
`,
    });
    const requestedLibraries: string[] = [];
    const widgets = [{ wrapperSelector: '.w', popupToggleSelector: '.t' }];

    const withLookup = await runBrowserOpen(harness.context, {
      resolveLibraryWidgets: (library) => {
        requestedLibraries.push(library);
        return widgets;
      },
    });
    const withoutLookup = await runBrowserOpen(harness.context);

    expect(requestedLibraries).toEqual(['kendo-jquery']);
    expect((await harness.sessions.get(withLookup.sessionId)).widgetTargets).toEqual(widgets);
    expect((await harness.sessions.get(withoutLookup.sessionId)).widgetTargets).toEqual([]);
  });

  it('opens a session and registers opening it as evidence', async () => {
    const harness = createBrowserTestHarness();

    const result = await runBrowserOpen(harness.context);

    expect(result).toMatchObject({
      sessionId: 'session-1-1',
      runId: 'run-1-2',
      environment: 'staging',
      baseUrl: 'https://staging.example.test/',
      allowlist: ['staging.example.test'],
    });
    expect(result.evidence).toMatchObject({
      id: 'evidence-1-3',
      runId: 'run-1-2',
      kind: 'action',
      path: 'evidence/run-1-2/evidence-1-3.json',
      redacted: false,
    });
    expect(harness.sessions.sessionIds).toEqual(['session-1-1']);
  });

  it('writes the action record without a step binding, since an exploratory session has no step', async () => {
    const harness = createBrowserTestHarness();

    const result = await runBrowserOpen(harness.context);

    const written = harness.fs.getRawFile(join('project', '.qa', 'evidence', 'run-1-2', 'evidence-1-3.json'));
    expect(JSON.parse(String(written))).toEqual({
      schemaVersion: 1,
      type: 'open',
      sessionId: 'session-1-1',
      url: 'https://staging.example.test/',
      at: '2026-09-21T10:00:00.000Z',
    });
    expect(result.evidence.stepId).toBeUndefined();
  });

  it('applies safe mode to every request for the whole session', async () => {
    const harness = createBrowserTestHarness();

    await runBrowserOpen(harness.context);

    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute');
    expect(routeCall?.args[0]).toBe('**/*');
  });

  it('keeps the GET-only rule by default even with executionMode omitted (ADR-0009)', async () => {
    const harness = createBrowserTestHarness();

    await runBrowserOpen(harness.context);

    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute');
    const handler = routeCall?.args[1] as (route: {
      request: () => { method: () => string; url: () => string };
      abort: () => Promise<void>;
      continue: () => Promise<void>;
    }) => Promise<void>;
    const calls: string[] = [];
    await handler({
      request: () => ({ method: () => 'POST', url: () => 'https://staging.example.test/login' }),
      abort: () => {
        calls.push('abort');
        return Promise.resolve();
      },
      continue: () => {
        calls.push('continue');
        return Promise.resolve();
      },
    });

    expect(calls).toEqual(['abort']);
  });

  it('allows a non-GET request within the allowlist when executionMode is set (P3-14, ADR-0009)', async () => {
    const harness = createBrowserTestHarness();

    await runBrowserOpen(harness.context, { executionMode: true });

    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute');
    const handler = routeCall?.args[1] as (route: {
      request: () => { method: () => string; url: () => string };
      abort: () => Promise<void>;
      continue: () => Promise<void>;
    }) => Promise<void>;
    const calls: string[] = [];
    await handler({
      request: () => ({ method: () => 'POST', url: () => 'https://staging.example.test/login' }),
      abort: () => {
        calls.push('abort');
        return Promise.resolve();
      },
      continue: () => {
        calls.push('continue');
        return Promise.resolve();
      },
    });

    expect(calls).toEqual(['continue']);
  });

  it('resolves a named environment', async () => {
    const harness = createBrowserTestHarness();

    const result = await runBrowserOpen(harness.context, { environment: 'staging' });

    expect(result.environment).toBe('staging');
  });

  it('fails with CONFIG_MISSING in a project with no .qa/ store', async () => {
    const harness = createBrowserTestHarness({ configYaml: null });

    await expect(runBrowserOpen(harness.context)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });

  it('closes the browser when the session could not be prepared', async () => {
    const harness = createBrowserTestHarness();
    let closed = 0;
    const failingBrowser: AuthBrowser = {
      newContext: () => Promise.reject(new Error('no context available')),
      contexts: () => [],
      close: () => {
        closed += 1;
        return Promise.resolve();
      },
    };
    const context = {
      ...harness.context,
      engine: {
        ...harness.context.engine,
        browserLauncher: {
          launch: () => Promise.resolve(failingBrowser),
          connectOverCdp: () => Promise.resolve(failingBrowser),
        },
      },
    };

    await expect(runBrowserOpen(context)).rejects.toThrow('no context available');

    expect(closed).toBe(1);
    expect(harness.sessions.sessionIds).toEqual([]);
  });

  it('warns and bypasses TLS validation when the environment opts out (P2-18)', async () => {
    const insecureConfigYaml = [
      'schemaVersion: 1',
      'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
      'environments:',
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"], tlsInsecure: true }',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n');
    const harness = createBrowserTestHarness({ configYaml: insecureConfigYaml });
    const warn = vi.fn();
    const context = {
      ...harness.context,
      engine: { ...harness.context.engine, logger: { ...harness.context.engine.logger, warn } },
    };

    await runBrowserOpen(context);

    expect(harness.launcher.newContextCalls).toEqual([{ ignoreHttpsErrors: true }]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('staging'),
      expect.objectContaining({ code: 'ENVIRONMENT_TLS_INSECURE', environment: 'staging' }),
    );
  });

  it('closes the session when its own opening could not be registered', async () => {
    const harness = createBrowserTestHarness({
      configYaml: BROWSER_CONFIG_WITH_SECRET_IN_URL,
    });

    await expect(runBrowserOpen(harness.context)).rejects.toMatchObject({
      code: 'BROWSER_EVIDENCE_QUARANTINED',
    });
    expect(harness.sessions.sessionIds).toEqual([]);
  });
});

describe('runBrowserOpen headed sessions (P6-105)', () => {
  const HEADED_ENVIRONMENT_YAML = BROWSER_TEST_CONFIG_YAML.replace(
    'allowlist: ["staging.example.test"] }',
    'allowlist: ["staging.example.test"], headed: true }',
  );

  function recordingHarness(
    configYaml?: string,
    launchFailure?: Error,
  ): {
    readonly context: ReturnType<typeof createBrowserTestHarness>['context'];
    readonly launchCalls: (LaunchOptions | undefined)[];
  } {
    const harness = createBrowserTestHarness(configYaml === undefined ? {} : { configYaml });
    const launchCalls: (LaunchOptions | undefined)[] = [];
    const browserLauncher = {
      ...harness.launcher,
      launch: (options?: LaunchOptions) => {
        launchCalls.push(options);
        return launchFailure === undefined ? harness.launcher.launch() : Promise.reject(launchFailure);
      },
    };
    return {
      context: { ...harness.context, engine: { ...harness.context.engine, browserLauncher } },
      launchCalls,
    };
  }

  it('launches headless and says so by default', async () => {
    const { context, launchCalls } = recordingHarness();

    const result = await runBrowserOpen(context);

    expect(launchCalls).toEqual([undefined]);
    expect(result.headed).toBe(false);
  });

  it('launches a visible window when the session asks for one', async () => {
    const { context, launchCalls } = recordingHarness();

    const result = await runBrowserOpen(context, { headed: true });

    expect(launchCalls).toEqual([{ headless: false }]);
    expect(result.headed).toBe(true);
  });

  it('uses the environment default when the session does not choose', async () => {
    const { context, launchCalls } = recordingHarness(HEADED_ENVIRONMENT_YAML);

    const result = await runBrowserOpen(context);

    expect(launchCalls).toEqual([{ headless: false }]);
    expect(result.headed).toBe(true);
  });

  it('lets the session override the environment default', async () => {
    const { context, launchCalls } = recordingHarness(HEADED_ENVIRONMENT_YAML);

    const result = await runBrowserOpen(context, { headed: false });

    expect(launchCalls).toEqual([undefined]);
    expect(result.headed).toBe(false);
  });

  it('keeps safe mode on a visible window', async () => {
    const harness = createBrowserTestHarness();

    await runBrowserOpen(harness.context, { headed: true });

    expect(harness.launcher.pageCalls.some((call) => call.method === 'contextRoute')).toBe(true);
  });

  it('turns a missing display into a coded error with a remediation', async () => {
    const { context } = recordingHarness(
      undefined,
      new Error('Looks like you launched a headed browser without having a XServer running.'),
    );

    await expect(runBrowserOpen(context, { headed: true })).rejects.toMatchObject({
      code: 'BROWSER_HEADED_UNAVAILABLE',
      remediation: expect.stringContaining('without "headed"') as string,
    });
  });

  it('passes any other launch failure through unchanged', async () => {
    const { context } = recordingHarness(undefined, new Error('browser executable is missing'));

    await expect(runBrowserOpen(context, { headed: true })).rejects.toThrow('browser executable is missing');
  });

  it('passes a launch failure that is not an Error through unchanged', async () => {
    const harness = createBrowserTestHarness();
    const context = {
      ...harness.context,
      engine: {
        ...harness.context.engine,
        browserLauncher: {
          ...harness.launcher,
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- proves a non-Error rejection is not mistaken for a missing display
          launch: () => Promise.reject('no X server'),
        },
      },
    };

    await expect(runBrowserOpen(context, { headed: true })).rejects.toBe('no X server');
  });
});
