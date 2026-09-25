// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { Config } from '@qa-ai-stlc/schemas';
import { describe, expect, it, vi } from 'vitest';
import type { AuthBrowser } from '../ports/browser-launcher.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { resolveBrowserEnvironment, runBrowserOpen } from './browser-open.js';

function configWithEnvironments(environments: Config['environments']): Config {
  return {
    schemaVersion: 1,
    testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
    environments,
    identities: {},
    data: { strategy: 'manual', ownerMarker: 'qa-ai-stlc' },
    selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid' },
    agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 },
  };
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

describe('runBrowserOpen', () => {
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

    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'route');
    expect(routeCall?.args[0]).toBe('**/*');
  });

  it('keeps the GET-only rule by default even with executionMode omitted (ADR-0009)', async () => {
    const harness = createBrowserTestHarness();

    await runBrowserOpen(harness.context);

    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'route');
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

    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'route');
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
