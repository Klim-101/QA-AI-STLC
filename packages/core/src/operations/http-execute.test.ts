// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QaError } from '../errors.js';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runHttpExecute } from './http-execute.js';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';

const NOW = new Date('2026-09-25T10:00:00.000Z');

// Covers both hosts this file's fixtures target: staging.example.test (most tests) and
// staging.internal (the tlsInsecure test, a distinct host on purpose).
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

function createContext(httpClient: EngineContext['httpClient']): {
  readonly context: EngineContext;
  readonly fs: FakeFileSystem;
} {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML });
  return { context: createFakeEngineContext({ fs, httpClient, clock: { now: () => NOW } }), fs };
}

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
        return Promise.resolve({ ok: true, status: 200, headers: {}, bodyText: '' });
      },
    };
    const { context } = createContext(httpClient);

    await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.example.test/login',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=admin%40example.com&password=admin123',
    });

    expect(receivedOptions).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=admin%40example.com&password=admin123',
    });
  });

  it('passes tlsInsecure through to the HTTP client', async () => {
    let receivedOptions: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1];
    const httpClient = {
      get: () => Promise.reject(new Error('get() not used in this fixture')),
      request: (url: string, options?: Parameters<ReturnType<typeof createFakeHttpClient>['request']>[1]) => {
        receivedOptions = options;
        return Promise.resolve({ ok: true, status: 200, headers: {}, bodyText: '' });
      },
    };
    const { context } = createContext(httpClient);

    await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.internal/',
      tlsInsecure: true,
    });

    expect(receivedOptions?.tlsInsecure).toBe(true);
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
  it('allows a non-GET request to a host on the allowlist', async () => {
    const httpClient = createFakeHttpClient({ ok: true, status: 200 });
    const { context } = createContext(httpClient);

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://staging.example.test/submit',
      method: 'DELETE',
    });

    expect(result.status).toBe(200);
  });
});
