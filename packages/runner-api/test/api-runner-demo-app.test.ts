// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHttpClient,
  hashText,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiRunner } from '../src/api-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports every other package's own demo-app test uses.
const PORT = 4400;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: in-scope, a11y: undecided, security: undecided }',
  `environments:\n  demo: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'api: { contract: openapi, source: discover }',
  '',
].join('\n');

function apiCase(id: string, path: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    feature: 'auth',
    requirementIds: ['req-1'],
    testType: 'api',
    title: id,
    steps: [{ description: `GET ${path}` }],
    expectedResult: 'as documented',
    endpoints: [{ method: 'GET', path }],
    status: 'approved',
    createdAt: '2026-09-30T12:00:00Z',
  });
}

async function createProject(projectRoot: string): Promise<EngineContext> {
  const casesDir = join(projectRoot, '.qa', 'artifacts', 'cases', 'auth');
  await mkdir(casesDir, { recursive: true });
  await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML);
  await writeFile(
    join(casesDir, 'demo-api-whoami-unauthenticated.json'),
    apiCase('demo-api-whoami-unauthenticated', '/api/whoami'),
  );
  await writeFile(
    join(casesDir, 'demo-api-issued-counter.json'),
    apiCase('demo-api-issued-counter', '/oauth/issued'),
  );
  return {
    projectRoot,
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner: nodeProcessRunner,
    httpClient: fetchHttpClient,
    browserLauncher: playwrightBrowserLauncher,
    env: process.env,
  };
}

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

// P6-04's exit criterion against the real app: API cases run for real through Playwright's
// `APIRequestContext`, and a case for an endpoint the demo app's contract does not document is
// rejected before any request is sent.
describe('apiRunner (demo app)', () => {
  it('runs a case backed by the discovered contract and records the contract hash in the manifest', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot);

      const outcomes = await apiRunner.run(engine, {
        runId: 'run-demo-api',
        baseUrl: BASE_URL,
        environment: 'demo',
        specFiles: [fixture('demo-app-whoami.playwright-spec.ts')],
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.result).toMatchObject({
        runId: 'run-demo-api',
        testCaseId: 'demo-api-whoami-unauthenticated',
        testType: 'api',
        status: 'passed',
      });

      const served = await (await fetch(`${BASE_URL}openapi.json`)).text();
      const manifest = JSON.parse(await readFile(join(projectRoot, '.qa', 'manifest.json'), 'utf-8')) as {
        artifacts: Record<string, { sha256: string }>;
      };
      expect(manifest.artifacts['artifacts/api-contract.txt']?.sha256).toBe(hashText(served));
    });
  }, 120_000);

  it('rejects a case for an endpoint absent from the contract without running the spec', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot);

      const rejected = await apiRunner
        .run(engine, {
          runId: 'run-demo-api-rejected',
          baseUrl: BASE_URL,
          environment: 'demo',
          specFiles: [fixture('demo-app-issued.playwright-spec.ts')],
        })
        .catch((caught: unknown) => caught);

      expect(rejected).toMatchObject({ code: 'API_CASE_NOT_IN_CONTRACT' });
      await expect(readFile(join(projectRoot, '.qa', 'manifest.json'))).rejects.toThrow();
    });
  }, 120_000);
});
