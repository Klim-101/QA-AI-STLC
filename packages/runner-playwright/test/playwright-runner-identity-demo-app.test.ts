// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  QaError,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playwrightRunner } from '../src/playwright-runner.js';

const PORT = 4423;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;
const PASSWORD_ENV = 'QA_DEMO_ADMIN_PASSWORD';

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

const SPEC_FILE = fileURLToPath(new URL('./fixtures/demo-app-protected.playwright-spec.ts', import.meta.url));

function configYaml(): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
    'environments:',
    `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"], identity: admin }`,
    'identities:',
    `  admin: { auth: storage-state, secret: ${PASSWORD_ENV}, loginUrl: "${BASE_URL}login", username: "admin@example.com" }`,
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

async function withProject(
  env: Record<string, string>,
  run: (engine: EngineContext) => Promise<void>,
): Promise<void> {
  await withTempDir(async (projectRoot) => {
    await mkdir(join(projectRoot, '.qa'), { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(), 'utf-8');
    await run({
      projectRoot,
      fs: nodeFileSystem,
      clock: systemClock,
      logger: noopLogger,
      processRunner: nodeProcessRunner,
      httpClient: fetchHttpClient,
      browserLauncher: playwrightBrowserLauncher,
      env: { ...process.env, ...env },
    });
  });
}

async function listStorageStateFiles(): Promise<readonly string[]> {
  const root = join(tmpdir(), 'qa-ai-stlc-runner-playwright');
  const entries = await readdir(root, { recursive: true }).catch(() => [] as string[]);
  return entries.filter((entry) => entry.endsWith('storage-state.json'));
}

describe('playwrightRunner signed in as an identity (demo app)', () => {
  it('opens a protected page with a spec that carries no credential, and leaves no session behind', async () => {
    const spec = await readFile(SPEC_FILE, 'utf-8');
    expect(spec).not.toContain('admin123');

    await withProject({ [PASSWORD_ENV]: 'admin123' }, async (engine) => {
      const outcomes = await playwrightRunner.run(engine, {
        runId: 'run-protected',
        baseUrl: BASE_URL,
        environment: 'staging',
        specFiles: [SPEC_FILE],
        identity: 'admin',
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.result.status).toBe('passed');
    });

    expect(await listStorageStateFiles()).toEqual([]);
  }, 120_000);

  it('runs the same spec against the login page when no identity is given', async () => {
    await withProject({ [PASSWORD_ENV]: 'admin123' }, async (engine) => {
      const outcomes = await playwrightRunner.run(engine, {
        runId: 'run-anonymous',
        baseUrl: BASE_URL,
        environment: 'staging',
        specFiles: [SPEC_FILE],
      });

      expect(outcomes[0]?.result.status).toBe('failed');
    });
  }, 120_000);

  it('fails with a coded error when the sign-in does not take, instead of running the specs', async () => {
    await withProject({ [PASSWORD_ENV]: 'not-the-real-password' }, async (engine) => {
      const error = await playwrightRunner
        .run(engine, {
          runId: 'run-bad-password',
          baseUrl: BASE_URL,
          environment: 'staging',
          specFiles: [SPEC_FILE],
          identity: 'admin',
        })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('RUN_SIGN_IN_FAILED');
      expect((error as QaError).remediation).toContain(PASSWORD_ENV);
    });

    expect(await listStorageStateFiles()).toEqual([]);
  }, 120_000);
});
