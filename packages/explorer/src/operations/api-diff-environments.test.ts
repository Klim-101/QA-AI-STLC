// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { EngineContext } from '@qa-ai-stlc/core';
import type { ApiDiffReport } from '@qa-ai-stlc/schemas';
import { createFakeExploreBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import { runApiDiff } from './api-diff.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  paths: { '/brands': { get: {} }, '/orders': { get: {} } },
});

// The endpoints two environments showed, and one stored before the field existed (ADR-0020).
const ENDPOINTS = JSON.stringify({
  schemaVersion: 1,
  generatedAt: '2026-09-30T11:00:00Z',
  endpoints: [
    { method: 'GET', path: '/brands', source: 'discovered', environment: 'local' },
    { method: 'GET', path: '/orders', source: 'discovered', environment: 'public' },
    { method: 'GET', path: '/extra', source: 'discovered' },
  ],
});

function fakeContext(environments: string): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'config.yaml')]: `${[
        'schemaVersion: 1',
        'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
        environments,
        'identities: {}',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        'api: { contract: openapi, source: "openapi.json" }',
      ].join('\n')}\n`,
      [join(QA_DIR, 'selectors', 'endpoints.json')]: ENDPOINTS,
      [join(PROJECT_ROOT, 'openapi.json')]: SPEC,
    }),
    clock: { now: () => new Date('2026-09-30T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: {
      get: () => Promise.reject(new Error('get is not used')),
      request: () => Promise.reject(new Error('request is not used')),
    },
    browserLauncher: createFakeExploreBrowserLauncher(),
    env: {},
  };
}

const TWO_ENVIRONMENTS = [
  'environments:',
  '  local: { baseUrl: "http://localhost:4200", allowlist: ["localhost"] }',
  '  public: { baseUrl: "https://shop.example.test", allowlist: ["shop.example.test"] }',
].join('\n');

async function findingsOf(context: EngineContext): Promise<string[]> {
  const report = JSON.parse(
    await context.fs.readFile(join(QA_DIR, 'selectors', 'api-diff.json')),
  ) as ApiDiffReport;
  return report.findings.map((finding) => `${finding.kind} ${finding.method} ${finding.path}`).sort();
}

describe('runApiDiff with several environments (ADR-0020)', () => {
  it('counts as observed only the endpoints of the environment it was given, and those of none', async () => {
    const context = fakeContext(TWO_ENVIRONMENTS);

    const summary = await runApiDiff(context, { environment: 'local' });

    expect(summary.counts).toEqual({ matched: 1, undocumented: 1, methodNotDocumented: 0, unobserved: 1 });
    expect(await findingsOf(context)).toEqual([
      'matched GET /brands',
      'undocumented GET /extra',
      'unobserved GET /orders',
    ]);
  });

  it('gives the other environment the other endpoints', async () => {
    const context = fakeContext(TWO_ENVIRONMENTS);

    await runApiDiff(context, { environment: 'public' });

    expect(await findingsOf(context)).toEqual([
      'matched GET /orders',
      'undocumented GET /extra',
      'unobserved GET /brands',
    ]);
  });

  it('uses the only environment when none is named', async () => {
    const context = fakeContext(
      'environments:\n  local: { baseUrl: "http://localhost:4200", allowlist: ["localhost"] }',
    );

    await runApiDiff(context);

    expect(await findingsOf(context)).toContain('matched GET /brands');
    expect(await findingsOf(context)).toContain('unobserved GET /orders');
  });

  it('asks which environment when there are several and none is named', async () => {
    const context = fakeContext(TWO_ENVIRONMENTS);

    await expect(runApiDiff(context)).rejects.toMatchObject({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' });
  });
});
