// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CliIO } from '../src/cli-io.js';
import { createCommandContext } from '../src/command-context.js';
import { runExplore } from '../src/commands/explore.js';
import { runInit } from '../src/commands/init.js';

// A different fixed port from packages/explorer's own demo-app tests (4391, 4392), so every
// integration test file can spawn its own demo app instance without a port collision.
const PORT = 4393;
const BASE_URL = `http://localhost:${String(PORT)}`;
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
  await waitForServer(`${BASE_URL}/login`, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
});

const noopIo: CliIO = { stdout: () => undefined, stderr: () => undefined };

function configYaml(): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    `  staging: { baseUrl: "${BASE_URL}/dashboard", allowlist: ["localhost"] }`,
    'identities:',
    '  admin: { auth: storage-state, secret: QA_DEMO_ADMIN_PASSWORD, loginUrl: "' +
      BASE_URL +
      '/login", username: "admin@example.com" }',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: testid-first, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

// Exercises the full P1-06..P1-15 chain against a real browser and a real running application
// (AGENTS.md section 13), and the exit criterion for issue #30 itself: "qa explore --verify fails
// after a deliberate test-ID rename in the demo app." The tasks page's "Apply" filter button
// carries a real `data-testid="apply-filter"` attribute (examples/demo-app/src/views/
// tasks-list.ejs) picked specifically for this test — neither of P1-12/P1-13's own demo-app
// fixtures (the login and new-task forms) can be touched, since their tests assert those forms
// have *no* test ID anywhere. A rename is simulated by rewriting the stored registry's primary
// candidate to a test ID that was never on the real page, rather than editing and reloading the
// live server mid-test: the effect `qa explore --verify` has to detect — a previously-recorded
// candidate that no longer resolves on the live page — is identical either way, since verify only
// ever re-checks the stored candidate against the current DOM, never asks *why* it stopped
// resolving.
describe('runExplore (demo app)', () => {
  it('builds a registry, verifies it clean, then fails --verify once the stored test ID is stale', async () => {
    await withTempDir(async (projectRoot) => {
      const context = createCommandContext({
        projectRoot,
        io: noopIo,
        browserLauncher: playwrightBrowserLauncher,
        env: { QA_DEMO_ADMIN_PASSWORD: 'admin123' },
      });
      await runInit(context, { deferScope: true });
      await context.fs.writeFile(join(context.projectRoot, '.qa', 'config.yaml'), configYaml());

      const built = await runExplore(context, { environment: 'staging', identity: 'admin' });
      expect(built.elementCount).toBeGreaterThan(0);

      const clean = await runExplore(context, { verify: true, identity: 'admin' });
      expect(clean.degraded).toEqual([]);

      const registryPath = join(context.projectRoot, '.qa', 'selectors', 'registry.json');
      const registry = JSON.parse(await context.fs.readFile(registryPath)) as {
        elements: { elementId: string; locatorCandidates: { strategy: string; value: string }[] }[];
      };
      const applyFilterElement = registry.elements.find((element) =>
        element.locatorCandidates.some((candidate) => candidate.strategy === 'testId'),
      );
      expect(applyFilterElement).toBeDefined();
      const testIdCandidate = applyFilterElement?.locatorCandidates.find(
        (candidate) => candidate.strategy === 'testId',
      );
      expect(testIdCandidate?.value).toBe('apply-filter');

      // Simulates the effect of a developer renaming `data-testid="apply-filter"` on the real
      // page: the stored registry still records the old value, which no longer resolves.
      if (testIdCandidate !== undefined) {
        testIdCandidate.value = 'apply-filter-renamed';
      }
      await context.fs.writeFile(registryPath, JSON.stringify(registry));

      const stale = await runExplore(context, { verify: true, identity: 'admin' });

      expect(stale.degraded.some((element) => element.elementId === applyFilterElement?.elementId)).toBe(
        true,
      );
    });
  }, 120_000);
});
