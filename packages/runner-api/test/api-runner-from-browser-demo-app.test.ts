// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHttpClient,
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

// A fixed port of its own (AGENTS.md 13): test files run in parallel.
const PORT = 4693;
const ORIGIN = `http://localhost:${String(PORT)}/`;
// The page that keeps a freshly issued token where a single-page app would and calls `/api/whoami`
// with it, which is what the profile below reads.
const BASE_URL = `${ORIGIN}token-demo.html`;
const STARTUP_TIMEOUT_MS = 60_000;
const PASSWORD_ENV = 'QA_DEMO_ADMIN_PASSWORD';

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

function configYaml(source: string, withIdentity: boolean): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: in-scope, a11y: undecided, security: undecided }',
    `environments:\n  demo: { baseUrl: "${BASE_URL}", allowlist: ["localhost"]${withIdentity ? ', identity: admin' : ''} }`,
    `identities:\n  admin: { auth: storage-state, secret: ${PASSWORD_ENV}, loginUrl: "${ORIGIN}login", username: "admin@example.com" }`,
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    'api: { contract: openapi, source: discover }',
    `apiAuth: { profiles: { stage-api: { type: from-browser, source: ${source} } }, defaults: {} }`,
    '',
  ].join('\n');
}

const SPEC_FILE = fileURLToPath(
  new URL('./fixtures/demo-app-from-browser.playwright-spec.ts', import.meta.url),
);

async function withProject(
  source: string,
  withIdentity: boolean,
  run: (engine: EngineContext) => Promise<void>,
): Promise<void> {
  await withTempDir(async (projectRoot) => {
    const casesDir = join(projectRoot, '.qa', 'artifacts', 'cases', 'auth');
    await mkdir(casesDir, { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(source, withIdentity));
    await writeFile(
      join(casesDir, 'demo-api-whoami-signed-in.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'demo-api-whoami-signed-in',
        feature: 'auth',
        requirementIds: ['req-1'],
        testType: 'api',
        title: 'whoami accepts the token the signed-in page used',
        steps: [{ description: 'GET /api/whoami' }],
        expectedResult: 'as documented',
        endpoints: [{ method: 'GET', path: '/api/whoami' }],
        status: 'approved',
        createdAt: '2026-10-15T12:00:00Z',
      }),
    );
    await run({
      projectRoot,
      fs: nodeFileSystem,
      clock: systemClock,
      logger: noopLogger,
      processRunner: nodeProcessRunner,
      httpClient: fetchHttpClient,
      browserLauncher: playwrightBrowserLauncher,
      env: { ...process.env, [PASSWORD_ENV]: 'admin123' },
    });
  });
}

// P6-97 against the real app: an api spec whose profile takes its token from a browser session runs
// with nobody at the keyboard, because the run signs in as the environment identity and reads the
// token from a headless page.
describe('apiRunner with a from-browser profile (demo app)', () => {
  it.each([
    ['a request header the page sent', '{ kind: request-header, header: Authorization }'],
    ['a sessionStorage key', '{ kind: session-storage, key: sessionToken }'],
    ['a cookie', '{ kind: cookie, name: api_token }'],
  ])(
    'passes using %s, with the identity from the environment',
    async (_label, source) => {
      await withProject(source, true, async (engine) => {
        const outcomes = await apiRunner.run(engine, {
          runId: 'run-from-browser',
          baseUrl: BASE_URL,
          environment: 'demo',
          specFiles: [SPEC_FILE],
          identity: 'admin',
        });

        expect(outcomes).toHaveLength(1);
        expect(outcomes[0]?.result).toMatchObject({
          testCaseId: 'demo-api-whoami-signed-in',
          status: 'passed',
        });
      });
    },
    120_000,
  );

  it('stops with a coded error naming the identity when the run has none', async () => {
    await withProject('{ kind: session-storage, key: sessionToken }', false, async (engine) => {
      const rejected = await apiRunner
        .run(engine, {
          runId: 'run-no-identity',
          baseUrl: BASE_URL,
          environment: 'demo',
          specFiles: [SPEC_FILE],
        })
        .catch((caught: unknown) => caught);

      expect(rejected).toMatchObject({ code: 'API_AUTH_SESSION_REQUIRED' });
    });
  }, 120_000);
});
