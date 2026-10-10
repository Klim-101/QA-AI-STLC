// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

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
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { a11yRunner } from '../src/a11y-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports every other package's own demo-app test uses.
const PORT = 4421;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
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
