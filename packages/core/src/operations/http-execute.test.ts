// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QaError } from '../errors.js';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { seedApprovedCase } from '../test-support/approved-case.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runHttpExecute } from './http-execute.js';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';

const NOW = new Date('2026-09-25T10:00:00.000Z');

// Covers both hosts this file's fixtures target: staging.example.test (most tests) and
// staging.internal (the tlsInsecure tests, a distinct host on purpose).
const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test", "staging.internal"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function createContext(
  httpClient: EngineContext['httpClient'],
  configYaml: string = CONFIG_YAML,
): {
  readonly context: EngineContext;
  readonly fs: FakeFileSystem;
} {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: configYaml });
  return { context: createFakeEngineContext({ fs, httpClient, clock: { now: () => NOW } }), fs };
}

describe('runHttpExecute: a redirect to a sign-in page', () => {
  const PROTECTED_URL = 'https://staging.example.test/api/tasks/1';

  function recordOf(fs: FakeFileSystem, path: string): Record<string, unknown> {
    return JSON.parse(String(fs.getRawFile(join('project', '.qa', path)))) as Record<string, unknown>;
  }

  it('reports followed redirects that end on the login page as blocked, not as the 200 it answered', async () => {
    const httpClient = createFakeHttpClient({
      ok: true,
      status: 200,
      bodyText: '<html>Log in</html>',
      redirectedTo: 'https://staging.example.test/login?next=%2Fapi%2Ftasks%2F1',
    });
    const { context, fs } = createContext(httpClient);

    const result = await runHttpExecute(context, { runId: 'run-1', url: PROTECTED_URL });

    expect(result.status).toBe(200);
    expect(result.blocked).toEqual({ reason: 'login-redirect', location: '/login' });
    expect(recordOf(fs, result.evidence.path)).toMatchObject({
      status: 200,
      blocked: { reason: 'login-redirect', location: '/login' },
    });
  });

  it('reports an unfollowed 3xx whose location is the login page as blocked', async () => {
    const httpClient = createFakeHttpClient({ ok: false, status: 302, headers: { location: '/signin' } });
    const { context } = createContext(httpClient);

    const result = await runHttpExecute(context, { runId: 'run-1', url: PROTECTED_URL });

    expect(result.blocked).toEqual({ reason: 'login-redirect', location: '/signin' });
  });

  it('reads the login path of a configured identity', async () => {
    const yaml = CONFIG_YAML.replace(
      'identities: {}',
      'identities: { admin: { auth: storage-state, loginUrl: "/welcome/enter", username: admin@example.test, secret: QA_ADMIN_PASSWORD } }',
    );
    const httpClient = createFakeHttpClient({
      ok: false,
      status: 302,
      headers: { location: '/welcome/enter' },
    });
    const { context } = createContext(httpClient, yaml);

    const result = await runHttpExecute(context, { runId: 'run-1', url: PROTECTED_URL });

    expect(result.blocked).toEqual({ reason: 'login-redirect', location: '/welcome/enter' });
  });

  it('leaves a redirect elsewhere and a plain answer unmarked', async () => {
    const elsewhere = createContext(
      createFakeHttpClient({
        ok: true,
        status: 200,
        redirectedTo: 'https://staging.example.test/api/tasks/2',
      }),
    );
    const plain = createContext(createFakeHttpClient({ ok: true, status: 200 }));

    const moved = await runHttpExecute(elsewhere.context, { runId: 'run-1', url: PROTECTED_URL });
    const answered = await runHttpExecute(plain.context, { runId: 'run-1', url: PROTECTED_URL });

    expect(moved).not.toHaveProperty('blocked');
    expect(answered).not.toHaveProperty('blocked');
    expect(recordOf(plain.fs, answered.evidence.path)).not.toHaveProperty('blocked');
  });
});

describe('runHttpExecute', () => {
  it('makes a request and registers the request/response as evidence', async () => {
    const httpClient = createFakeHttpClient({
      ok: true,
      status: 200,
      headers: { 'content-type': 'text/html' },
      bodyText: '<html>ok</html>',
    });
    const { context, fs } = createContext(httpClient);

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.example.test/login',
      idGenerator: createSequentialIdGenerator('id'),
    });

    expect(result.status).toBe(200);
    expect(result.evidence).toMatchObject({ id: 'evidence-id-1', runId: 'run-1', kind: 'other' });
    const written = JSON.parse(String(fs.getRawFile(join('project', '.qa', result.evidence.path)))) as {
      type: string;
      method: string;
      url: string;
      status: number;
      truncated: boolean;
      bodyPreview: string;
    };
    expect(written).toMatchObject({
      type: 'http-request',
      method: 'GET',
      url: 'https://staging.example.test/login',
      status: 200,
      truncated: false,
      bodyPreview: '<html>ok</html>',
    });
  });

  it('passes method, headers and body through to the HTTP client', async () => {
    let receivedOptions: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1];
    const httpClient = {
      get: () => Promise.reject(new Error('get() not used in this fixture')),
      request: (url: string, options?: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1]) => {
        receivedOptions = options;
        return Promise.resolve({ ok: true, status: 200, headers: {}, setCookies: [], bodyText: '' });
      },
    };
    const { context } = createContext(httpClient);
    const caseId = await seedApprovedCase(context);

    await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.example.test/login',
      method: 'POST',
      caseId,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=admin%40example.com&password=admin123',
    });

    expect(receivedOptions).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=admin%40example.com&password=admin123',
    });
  });

  it('validates certificates when the environment does not set tlsInsecure, whatever the caller passes', async () => {
    let receivedOptions: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1];
    const httpClient = {
      get: () => Promise.reject(new Error('get() not used in this fixture')),
      request: (url: string, options?: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1]) => {
        receivedOptions = options;
        return Promise.resolve({ ok: true, status: 200, headers: {}, setCookies: [], bodyText: '' });
      },
    };
    const warn = vi.fn();
    const { context } = createContext(httpClient);

    await runHttpExecute(
      { ...context, logger: { ...context.logger, warn } },
      {
        runId: 'run-1',
        url: 'https://staging.internal/',
        // @ts-expect-error -- tlsInsecure is no longer a caller option; the environment decides.
        tlsInsecure: true,
      },
    );

    expect(receivedOptions).not.toHaveProperty('tlsInsecure');
    expect(warn).not.toHaveBeenCalled();
  });

  it("honors the environment's tlsInsecure without the caller passing anything, and warns", async () => {
    let receivedOptions: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1];
    const httpClient = {
      get: () => Promise.reject(new Error('get() not used in this fixture')),
      request: (url: string, options?: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1]) => {
        receivedOptions = options;
        return Promise.resolve({ ok: true, status: 200, headers: {}, setCookies: [], bodyText: '' });
      },
    };
    const warn = vi.fn();
    const insecureConfigYaml = CONFIG_YAML.replace(
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test", "staging.internal"] }',
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test", "staging.internal"], tlsInsecure: true }',
    );
    const { context } = createContext(httpClient, insecureConfigYaml);

    await runHttpExecute(
      { ...context, logger: { ...context.logger, warn } },
      { runId: 'run-1', url: 'https://staging.internal/' },
    );

    expect(receivedOptions?.tlsInsecure).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('staging'),
      expect.objectContaining({ code: 'ENVIRONMENT_TLS_INSECURE', environment: 'staging' }),
    );
  });

  it('truncates a response body longer than the preview cap', async () => {
    const longBody = 'x'.repeat(5000);
    const httpClient = createFakeHttpClient({ ok: true, status: 200, bodyText: longBody });
    const { context, fs } = createContext(httpClient);

    const result = await runHttpExecute(context, { runId: 'run-1', url: 'https://staging.example.test/' });

    const written = JSON.parse(String(fs.getRawFile(join('project', '.qa', result.evidence.path)))) as {
      truncated: boolean;
      bodyPreview: string;
    };
    expect(written.truncated).toBe(true);
    expect(written.bodyPreview).toHaveLength(4000);
  });

  it('honors a configured evidence.httpBodyPreviewMaxLength (P6-23), overriding the default 4000', async () => {
    const shortPreviewConfigYaml = CONFIG_YAML.replace(
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      [
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        'evidence: { httpBodyPreviewMaxLength: 10 }',
      ].join('\n'),
    );
    const httpClient = createFakeHttpClient({ ok: true, status: 200, bodyText: 'x'.repeat(20) });
    const { context, fs } = createContext(httpClient, shortPreviewConfigYaml);

    const result = await runHttpExecute(context, { runId: 'run-1', url: 'https://staging.example.test/' });

    const written = JSON.parse(String(fs.getRawFile(join('project', '.qa', result.evidence.path)))) as {
      truncated: boolean;
      bodyPreview: string;
    };
    expect(written.truncated).toBe(true);
    expect(written.bodyPreview).toHaveLength(10);
  });

  it('carries a stepId into the recorded evidence, for qa-generate-tests (P3-07) to recover later', async () => {
    const httpClient = createFakeHttpClient({ ok: true, status: 200, bodyText: 'ok' });
    const { context, fs } = createContext(httpClient);

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.example.test/login',
      stepId: 'step-3',
    });

    const written = JSON.parse(String(fs.getRawFile(join('project', '.qa', result.evidence.path)))) as {
      stepId?: string;
    };
    expect(written.stepId).toBe('step-3');
  });

  // Regression, #364: qa.http_execute previously called any URL with no allowlist check at all.
  it("rejects a URL off the resolved environment's allowlist before making any request", async () => {
    const httpClient = createFakeHttpClient({ ok: true, status: 200 });
    const { context } = createContext(httpClient);

    const error = await runHttpExecute(context, { runId: 'run-1', url: 'https://evil.test/' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('BROWSER_URL_NOT_ALLOWED');
  });

  // Regression, #364: the allowlist check must restrict hosts, never methods — a non-GET request
  // to an allowed host (already exercised above with POST) must keep succeeding.
  it('allows a non-GET request to a host on the allowlist, for an approved case', async () => {
    const httpClient = createFakeHttpClient({ ok: true, status: 200 });
    const { context } = createContext(httpClient);
    const caseId = await seedApprovedCase(context);

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.example.test/submit',
      method: 'DELETE',
      caseId,
    });

    expect(result.status).toBe(200);
  });

  describe('a method that is not a safe read (ADR-0009, ADR-0021)', () => {
    function countingClient() {
      const sent: string[] = [];
      const httpClient = {
        get: () => Promise.reject(new Error('get() not used in this fixture')),
        request: (url: string, options?: { readonly method?: string }) => {
          sent.push(options?.method ?? 'GET');
          return Promise.resolve({ ok: true, status: 200, headers: {}, setCookies: [], bodyText: '' });
        },
      } as unknown as EngineContext['httpClient'];
      return { httpClient, sent };
    }

    it('is refused without a case, and nothing is sent', async () => {
      const { httpClient, sent } = countingClient();
      const { context } = createContext(httpClient);

      const error = await runHttpExecute(context, {
        runId: 'run-1',
        url: 'https://staging.example.test/submit',
        method: 'POST',
      }).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'HTTP_EXECUTE_CASE_REQUIRED' });
      expect(sent).toEqual([]);
    });

    it('is refused for a case the operator has not approved, and nothing is sent', async () => {
      const { httpClient, sent } = countingClient();
      const { context } = createContext(httpClient);
      const caseId = await seedApprovedCase(context, { skipCasesApproval: true });

      const error = await runHttpExecute(context, {
        runId: 'run-1',
        url: 'https://staging.example.test/submit',
        method: 'PUT',
        caseId,
      }).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'EXECUTION_CASE_NOT_APPROVED' });
      expect(sent).toEqual([]);
    });

    it('treats a method written in another case as not safe', async () => {
      const { httpClient, sent } = countingClient();
      const { context } = createContext(httpClient);

      await expect(
        runHttpExecute(context, {
          runId: 'run-1',
          url: 'https://staging.example.test/items',
          method: 'get',
        }),
      ).rejects.toMatchObject({ code: 'HTTP_EXECUTE_CASE_REQUIRED' });
      expect(sent).toEqual([]);
    });

    it.each(['GET', 'HEAD', 'OPTIONS', 'QUERY'])('lets %s through without a case', async (method) => {
      const { httpClient, sent } = countingClient();
      const { context } = createContext(httpClient);

      await runHttpExecute(context, {
        runId: 'run-1',
        url: 'https://staging.example.test/items',
        method,
      });

      expect(sent).toEqual([method]);
    });
  });
});
