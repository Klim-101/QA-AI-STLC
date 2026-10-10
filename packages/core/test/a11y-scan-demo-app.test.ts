// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import { runBrowserAccessibilityScan } from '../src/operations/browser-accessibility-scan.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// Distinct from the ports the other demo-app tests bind.
const PORT = 4397;
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
    'testing: { e2e: in-scope, api: out-of-scope, a11y: in-scope, security: out-of-scope }',
    'environments:',
    `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    `a11y: ${a11yFlow}`,
    '',
  ].join('\n');
}

interface ScanEvidence {
  readonly violations: readonly { readonly id: string }[];
  readonly excepted: readonly { readonly ruleId: string }[];
  readonly uncertain: readonly { readonly id: string }[];
}

async function scanFixture(a11yFlow: string): Promise<ScanEvidence> {
  return withTempDir(async (projectRoot) => {
    await mkdir(join(projectRoot, '.qa'), { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(a11yFlow), 'utf-8');
    const context: BrowserOperationContext = {
      engine: {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: process.env,
      },
      sessions: new BrowserSessionStore(),
    };
    const { sessionId } = await runBrowserOpen(context, { environment: 'staging' });
    await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}a11y-fixture.html` });
    const scan = await runBrowserAccessibilityScan(context, { sessionId });
    await context.sessions.close(sessionId);
    const raw = await readFile(join(projectRoot, '.qa', ...scan.evidence.path.split('/')), 'utf-8');
    return JSON.parse(raw) as ScanEvidence;
  });
}

function ruleIds(entries: readonly { readonly id: string }[]): string[] {
  return entries.map((entry) => entry.id);
}

// The fixture page has one violation per level: a missing image alternative (A), low contrast
// (AA), contrast that passes AA but fails the enhanced ratio (AAA), and text over a gradient
// that axe-core cannot decide on its own.
describe('level-aware axe scan (demo app fixture page)', () => {
  it('reports an AA-only violation at AA and not at A', async () => {
    const levelA = await scanFixture('{ level: A }');
    const levelAA = await scanFixture('{ level: AA }');

    expect(ruleIds(levelA.violations)).toContain('image-alt');
    expect(ruleIds(levelA.violations)).not.toContain('color-contrast');
    expect(ruleIds(levelAA.violations)).toEqual(expect.arrayContaining(['image-alt', 'color-contrast']));
    expect(ruleIds(levelAA.violations)).not.toContain('color-contrast-enhanced');
  }, 60_000);

  it('runs the AAA rules axe-core disables by default when the target is AAA', async () => {
    const levelAAA = await scanFixture('{ level: AAA }');

    expect(ruleIds(levelAAA.violations)).toContain('color-contrast-enhanced');
  }, 60_000);

  it('surfaces an incomplete result as uncertain and lists an exception as excepted', async () => {
    const scan = await scanFixture(
      '{ exceptions: [{ ruleId: image-alt, reason: Decorative fixture image }] }',
    );

    expect(ruleIds(scan.uncertain)).toContain('color-contrast');
    expect(scan.excepted.map((entry) => entry.ruleId)).toEqual(['image-alt']);
    expect(ruleIds(scan.violations)).not.toContain('image-alt');
  }, 60_000);
});
