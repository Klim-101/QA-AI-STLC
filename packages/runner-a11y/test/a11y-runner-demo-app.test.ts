// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { A11yScanRecordSchema } from '@qa-ai-stlc/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { a11yRunner } from '../src/a11y-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports every other package's own demo-app test uses.
const PORT = 4421;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ChildProcess;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Demo app did not become reachable at ${url} within ${String(timeoutMs)}ms`);
}

beforeAll(async () => {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath === undefined) {
    throw new Error('This test must run through an npm script (npm_execpath is unset).');
  }
  demoApp = spawn(process.execPath, [npmExecPath, 'run', 'start', '--workspace', '@qa-ai-stlc/demo-app'], {
    cwd: repoRoot,
    env: { ...process.env, DEMO_APP_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer(`${BASE_URL}a11y-fixture.html`, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
});

function configYaml(a11yFlow: string): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: out-of-scope, a11y: in-scope, security: undecided }',
    'environments:',
    `  demo: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    `a11y: ${a11yFlow}`,
    '',
  ].join('\n');
}

const SPEC_SOURCE = [
  "import { test } from '@playwright/test';",
  "import { scanAccessibility } from './qa/a11y-scan.js';",
  '',
  'test(',
  "  'fixture page is accessible',",
  "  { annotation: { type: 'testCaseId', description: 'demo-a11y-fixture' } },",
  '  async ({ page }, testInfo) => {',
  "    await page.goto('/a11y-fixture.html');",
  '    await scanAccessibility(page, testInfo);',
  '  },',
  ');',
  '',
].join('\n');

// The project lives inside this package, not the OS temp directory, so the spec's own
// `@playwright/test` import resolves through the repository's `node_modules`.
async function withProject<T>(
  a11yFlow: string,
  use: (engine: EngineContext, specFile: string) => Promise<T>,
): Promise<T> {
  const projectRoot = await mkdtemp(fileURLToPath(new URL('./.project-', import.meta.url)));
  try {
    await mkdir(join(projectRoot, '.qa'), { recursive: true });
    await mkdir(join(projectRoot, 'tests'), { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(a11yFlow), 'utf-8');
    const specFile = join(projectRoot, 'tests', 'a11y.spec.ts');
    await writeFile(specFile, SPEC_SOURCE, 'utf-8');
    const engine: EngineContext = {
      projectRoot,
      fs: nodeFileSystem,
      clock: systemClock,
      logger: noopLogger,
      processRunner: nodeProcessRunner,
      httpClient: fetchHttpClient,
      browserLauncher: playwrightBrowserLauncher,
      env: process.env,
    };
    return await use(engine, specFile);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

// P6-05's exit criterion against the real app: the demo app's accessibility fixture produces
// findings that reach the evidence store as scan records, and the case's status follows them.
describe('a11yRunner (demo app)', () => {
  it('fails a case whose page violates the configured level and keeps the scan as evidence', async () => {
    await withProject('{}', async (engine, specFile) => {
      const outcomes = await a11yRunner.run(engine, {
        runId: 'run-demo-a11y',
        baseUrl: BASE_URL,
        environment: 'demo',
        specFiles: [specFile],
      });

      expect(outcomes).toHaveLength(1);
      const [outcome] = outcomes;
      expect(outcome?.result).toMatchObject({
        testCaseId: 'demo-a11y-fixture',
        testType: 'a11y',
        status: 'failed',
      });
      expect(outcome?.result.failure?.message).toContain('image-alt');
      expect(outcome?.result.failure?.message).toContain('color-contrast');

      const scan = outcome?.evidence.find((item) => item.kind === 'other');
      const record = A11yScanRecordSchema.parse(JSON.parse(String(scan?.content)));
      expect(record.violations.map((violation) => violation.id)).toEqual(
        expect.arrayContaining(['image-alt', 'color-contrast']),
      );
      expect(record.uncertain.map((entry) => entry.id)).toContain('color-contrast');
      await expect(
        readFile(join(engine.projectRoot, 'tests', 'qa', 'a11y-scan.ts'), 'utf-8'),
      ).resolves.toContain('scanAccessibility');
    });
  }, 120_000);

  it('leaves a case uncertain when every violation is excepted and an incomplete result remains', async () => {
    const exceptions = [
      '{ ruleId: image-alt, reason: "Fixture image is decorative" }',
      '{ ruleId: color-contrast, reason: "Known fixture contrast issue" }',
    ].join(', ');
    await withProject(`{ exceptions: [${exceptions}] }`, async (engine, specFile) => {
      const outcomes = await a11yRunner.run(engine, {
        runId: 'run-demo-a11y-excepted',
        baseUrl: BASE_URL,
        environment: 'demo',
        specFiles: [specFile],
      });

      expect(outcomes[0]?.result.status).toBe('uncertain');
      const scan = outcomes[0]?.evidence.find((item) => item.kind === 'other');
      const record = A11yScanRecordSchema.parse(JSON.parse(String(scan?.content)));
      expect(record.violations).toEqual([]);
      expect(record.excepted.map((entry) => entry.ruleId)).toEqual(
        expect.arrayContaining(['image-alt', 'color-contrast']),
      );
    });
  }, 120_000);
});
