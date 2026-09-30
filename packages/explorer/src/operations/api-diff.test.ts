// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError, hashText, type EngineContext, type HttpClient } from '@qa-ai-stlc/core';
import type { ApiDiffReport } from '@qa-ai-stlc/schemas';
import { createFakeExploreBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import { runApiDiff } from './api-diff.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const BASE_URL = 'https://staging.example.com';
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  paths: {
    '/tasks/{taskId}': { get: { operationId: 'getTask' } },
    '/oauth/revoke-all': { post: {} },
  },
});
const ENDPOINTS = JSON.stringify({
  schemaVersion: 1,
  generatedAt: '2026-09-30T11:00:00Z',
  endpoints: [
    { method: 'GET', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/t-1'] },
    { method: 'GET', path: '/oauth/issued', source: 'discovered' },
  ],
});

function configYaml(apiSource: string | undefined, environments?: string): string {
  return `${[
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    environments ??
      `environments:\n  staging: { baseUrl: "${BASE_URL}", allowlist: ["staging.example.com"] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    apiSource === undefined ? '' : `api: { contract: openapi, source: ${JSON.stringify(apiSource)} }`,
  ]
    .filter((line) => line.length > 0)
    .join('\n')}\n`;
}

function httpClientServing(
  routes: Readonly<Record<string, { status: number; bodyText: string }>>,
): HttpClient {
  return {
    get: () => Promise.reject(new Error('get is not used')),
    request: (url) => {
      const route = routes[url] ?? { status: 404, bodyText: '' };
      return Promise.resolve({
        ok: route.status < 400,
        status: route.status,
        headers: {},
        bodyText: route.bodyText,
      });
    },
  };
}

function fakeContext(
  apiSource: string | undefined,
  options: {
    readonly files?: Readonly<Record<string, string>>;
    readonly routes?: Readonly<Record<string, { status: number; bodyText: string }>>;
    readonly environments?: string;
    readonly endpoints?: boolean;
  } = {},
): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'config.yaml')]: configYaml(apiSource, options.environments),
      ...(options.endpoints === false ? {} : { [join(QA_DIR, 'selectors', 'endpoints.json')]: ENDPOINTS }),
      ...options.files,
    }),
    clock: { now: () => new Date('2026-09-30T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: httpClientServing(options.routes ?? {}),
    browserLauncher: createFakeExploreBrowserLauncher(),
    env: {},
  };
}

async function readReport(context: EngineContext): Promise<ApiDiffReport> {
  return JSON.parse(await context.fs.readFile(join(QA_DIR, 'selectors', 'api-diff.json'))) as ApiDiffReport;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return error instanceof QaError ? error.code : undefined;
}

describe('runApiDiff', () => {
  it('diffs a project-relative contract file, stamps its hash and registers the report', async () => {
    const context = fakeContext('openapi.json', { files: { [join(PROJECT_ROOT, 'openapi.json')]: SPEC } });

    const summary = await runApiDiff(context);

    expect(summary).toEqual({
      reportPath: 'selectors/api-diff.json',
      contractSource: 'openapi.json',
      contractSha256: hashText(SPEC),
      counts: { matched: 1, undocumented: 1, methodNotDocumented: 0, unobserved: 1 },
    });
    const report = await readReport(context);
    expect(report.generatedAt).toBe('2026-09-30T12:00:00.000Z');
    expect(report.findings.map((finding) => `${finding.kind} ${finding.method} ${finding.path}`)).toEqual([
      'undocumented GET /oauth/issued',
      'unobserved POST /oauth/revoke-all',
      'matched GET /tasks/{id}',
    ]);
    const manifest = await context.fs.readFile(join(QA_DIR, 'manifest.json'));
    expect(manifest).toContain('selectors/api-diff.json');
  });

  it('probes the known spec paths when api.source is "discover"', async () => {
    const context = fakeContext('discover', {
      routes: { [`${BASE_URL}/openapi.json`]: { status: 200, bodyText: SPEC } },
    });

    const summary = await runApiDiff(context, { environment: 'staging' });

    expect(summary.contractSource).toBe(`${BASE_URL}/openapi.json`);
    expect(summary.contractSha256).toBe(hashText(SPEC));
  });

  it('passes tlsInsecure through to the discovery probes', async () => {
    const seen: (boolean | undefined)[] = [];
    const context = {
      ...fakeContext('discover', {
        environments: `environments:\n  staging: { baseUrl: "${BASE_URL}", allowlist: ["staging.example.com"], tlsInsecure: true }`,
      }),
      httpClient: {
        get: () => Promise.reject(new Error('unused')),
        request: (_url: string, options?: { readonly tlsInsecure?: boolean }) => {
          seen.push(options?.tlsInsecure);
          return Promise.resolve({ ok: true, status: 200, headers: {}, bodyText: SPEC });
        },
      },
    };

    await runApiDiff(context);

    expect(seen).toEqual([true]);
  });

  it('fetches a contract URL on the allowlist', async () => {
    const url = `${BASE_URL}/docs/spec.json`;
    const context = fakeContext(url, { routes: { [url]: { status: 200, bodyText: SPEC } } });

    expect((await runApiDiff(context)).contractSource).toBe(url);
  });

  it('passes tlsInsecure through to a contract URL fetch', async () => {
    const url = `${BASE_URL}/docs/spec.json`;
    const seen: (boolean | undefined)[] = [];
    const context = {
      ...fakeContext(url, {
        environments: `environments:\n  staging: { baseUrl: "${BASE_URL}", allowlist: ["staging.example.com"], tlsInsecure: true }`,
      }),
      httpClient: {
        get: () => Promise.reject(new Error('unused')),
        request: (_url: string, options?: { readonly tlsInsecure?: boolean }) => {
          seen.push(options?.tlsInsecure);
          return Promise.resolve({ ok: true, status: 200, headers: {}, bodyText: SPEC });
        },
      },
    };

    await runApiDiff(context);

    expect(seen).toEqual([true]);
  });

  it.each([
    ['API_CONTRACT_NOT_CONFIGURED', undefined, {}],
    ['API_CONTRACT_SYNTHESIZE_UNSUPPORTED', 'synthesize', {}],
    ['API_CONTRACT_DISCOVERY_FAILED', 'discover', {}],
    ['API_CONTRACT_URL_NOT_ALLOWED', 'https://elsewhere.example.org/spec.json', {}],
    [
      'API_CONTRACT_UNREADABLE',
      `${BASE_URL}/missing.json`,
      { routes: { [`${BASE_URL}/missing.json`]: { status: 404, bodyText: '' } } },
    ],
    ['API_CONTRACT_UNREADABLE', 'absent.json', {}],
    [
      'API_CONTRACT_NOT_OPENAPI',
      'page.html',
      { files: { [join(PROJECT_ROOT, 'page.html')]: '<html></html>' } },
    ],
    ['API_DIFF_NO_ENDPOINTS', 'openapi.json', { endpoints: false }],
  ])('throws %s', async (code, apiSource, options) => {
    expect(await codeOf(runApiDiff(fakeContext(apiSource, options)))).toBe(code);
  });
});
