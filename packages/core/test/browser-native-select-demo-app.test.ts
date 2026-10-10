// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserExpect } from '../src/operations/browser-expect.js';
import { runBrowserSelectOption } from '../src/operations/browser-select-option.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4412;
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
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"], actionTimeoutMs: 5000 }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

async function withContext(
  run: (context: BrowserOperationContext, sessionId: string) => Promise<void>,
): Promise<void> {
  await withTempDir(async (projectRoot) => {
    await mkdir(join(projectRoot, '.qa'), { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
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
    const sessions = new BrowserSessionStore();
    const context: BrowserOperationContext = { engine, sessions };
    try {
      const { sessionId } = await runBrowserOpen(context, { environment: 'staging' });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}login` });
      await run(context, sessionId);
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

interface PageOption {
  textContent: string | null;
  selected: boolean;
}

interface PageSelect {
  id: string;
  multiple: boolean;
  append(node: unknown): void;
}

interface PageDocument {
  createElement(tag: string): PageSelect & PageOption;
  querySelector(selector: string): { append(node: unknown): void } | null;
}

// Runs inside the page, where nothing from this module exists, so it reads `document` for itself.
function addSelects(): void {
  const { document } = globalThis as unknown as { document: PageDocument };
  for (const [id, isMultiple] of [
    ['priority', false],
    ['tags', true],
  ] as const) {
    const select = document.createElement('select');
    select.id = id;
    select.multiple = isMultiple;
    for (const label of ['Low', 'Medium', 'High']) {
      const option = document.createElement('option');
      option.textContent = label;
      select.append(option);
    }
    document.querySelector('main')?.append(select);
  }
}

async function selectedLabels(context: BrowserOperationContext, sessionId: string): Promise<string[]> {
  const session = await context.sessions.get(sessionId);
  const labels = await session.page.evaluate(() => {
    const { document } = globalThis as unknown as {
      document: { querySelectorAll(selector: string): ArrayLike<{ textContent: string }> };
    };
    return Array.from(document.querySelectorAll('#tags option:checked')).map((option) => option.textContent);
  });
  return labels as string[];
}

describe('qa.browser_select_option on a native select in the demo app', () => {
  it('picks an option by its visible text and registers the action without the text', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addSelects);

      const picked = await runBrowserSelectOption(context, {
        sessionId,
        selector: '#priority',
        optionText: 'High',
        stepId: 'step-2',
      });

      const shown = await runBrowserExpect(context, {
        sessionId,
        kind: 'value',
        selector: '#priority',
        expected: '',
        timeoutMs: 0,
      });
      expect(shown.observed).toBe('High');
      const record: unknown = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', picked.evidence.path), 'utf-8'),
      );
      expect(record).toMatchObject({
        type: 'select-option',
        selector: '#priority',
        valueLength: 4,
        stepId: 'step-2',
      });
    });
  }, 30_000);

  it('adds to what a multi-select already has chosen', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addSelects);

      await runBrowserSelectOption(context, { sessionId, selector: '#tags', optionText: 'Low' });
      await runBrowserSelectOption(context, { sessionId, selector: '#tags', optionText: 'High' });
      await runBrowserSelectOption(context, { sessionId, selector: '#tags', optionText: 'High' });

      expect(await selectedLabels(context, sessionId)).toEqual(['Low', 'High']);
    });
  }, 30_000);

  it('fails with a coded error naming the options it has when one is missing', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addSelects);

      const failure = await runBrowserSelectOption(context, {
        sessionId,
        selector: '#priority',
        optionText: 'Critical',
      }).catch((caught: unknown) => caught);

      expect(failure).toMatchObject({ code: 'BROWSER_WIDGET_OPTION_NOT_FOUND' });
      expect((failure as Error).message).toContain('"Low", "Medium", "High"');
    });
  }, 30_000);
});
