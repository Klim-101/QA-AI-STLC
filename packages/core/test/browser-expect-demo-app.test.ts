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
import { runBrowserFill } from '../src/operations/browser-fill.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserExpect } from '../src/operations/browser-expect.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4410;
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
  page: string,
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
      const { sessionId } = await runBrowserOpen(context, {
        environment: 'staging',
      });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}${page}` });
      await run(context, sessionId);
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

interface FormElement {
  checked: boolean;
  id: string;
  type: string;
  textContent: string | null;
  append(node: unknown): void;
}

interface PageDocument {
  createElement(tag: string): FormElement;
  querySelector(selector: string): FormElement | null;
}

// These two run inside the page, where nothing from this module exists, so each one reads
// `document` for itself.
function addCheckbox(): void {
  const { document } = globalThis as unknown as { document: PageDocument };
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'agree';
  box.checked = true;
  document.querySelector('form')?.append(box);
}

function addBannerSoon(): void {
  const page = globalThis as unknown as {
    document: PageDocument;
    setTimeout(callback: () => void, milliseconds: number): void;
  };
  const { document } = page;
  page.setTimeout(() => {
    const banner = document.createElement('p');
    banner.id = 'late';
    banner.textContent = 'Arrived';
    document.querySelector('main')?.append(banner);
  }, 400);
}

const SHORT = { timeoutMs: 300 } as const;

describe('qa.browser_expect on the demo app', () => {
  it('checks visible and hidden, passing and failing, and says what it saw', async () => {
    await withContext(async (context, sessionId) => {
      const shown = await runBrowserExpect(context, { sessionId, kind: 'visible', selector: 'h1', ...SHORT });
      const missing = await runBrowserExpect(context, {
        sessionId,
        kind: 'visible',
        selector: '#nope',
        ...SHORT,
      });
      const hiddenMissing = await runBrowserExpect(context, { sessionId, kind: 'hidden', selector: '#nope' });
      const hiddenShown = await runBrowserExpect(context, {
        sessionId,
        kind: 'hidden',
        selector: 'h1',
        ...SHORT,
      });

      expect(shown).toMatchObject({ passed: true, observed: 'visible' });
      expect(missing).toMatchObject({ passed: false, observed: 'absent', matchCount: 0 });
      expect(hiddenMissing).toMatchObject({ passed: true, observed: 'absent' });
      expect(hiddenShown).toMatchObject({ passed: false, observed: 'visible' });
    }, 'login');
  }, 30_000);

  it('checks text, passing and failing, and returns the observed text', async () => {
    await withContext(async (context, sessionId) => {
      const same = await runBrowserExpect(context, {
        sessionId,
        kind: 'text',
        selector: 'h1',
        expected: 'Log in',
        exact: true,
      });
      const other = await runBrowserExpect(context, {
        sessionId,
        kind: 'text',
        selector: 'h1',
        expected: 'Sign up',
        ...SHORT,
      });

      expect(same).toMatchObject({ passed: true, observed: 'Log in' });
      expect(other).toMatchObject({ passed: false, expected: 'Sign up', observed: 'Log in' });
    }, 'login');
  }, 30_000);

  it('checks the value a field holds, and the evidence carries the verdict', async () => {
    await withContext(async (context, sessionId) => {
      await runBrowserFill(context, { sessionId, selector: '#email', value: 'admin@example.com' });

      const same = await runBrowserExpect(context, {
        sessionId,
        kind: 'value',
        selector: '#email',
        expected: 'admin@example.com',
        stepId: 'step-3',
      });
      const other = await runBrowserExpect(context, {
        sessionId,
        kind: 'value',
        selector: '#email',
        expected: 'someone@example.com',
        ...SHORT,
      });

      expect(same.passed).toBe(true);
      expect(other).toMatchObject({ passed: false, observed: 'admin@example.com' });
      const record: unknown = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', other.evidence.path), 'utf-8'),
      );
      expect(record).toMatchObject({
        type: 'expect',
        selector: '#email',
        expectation: { kind: 'value', passed: false, observed: 'admin@example.com' },
      });
    }, 'login');
  }, 30_000);

  it('never records a password: not what was typed, not what was expected', async () => {
    await withContext(async (context, sessionId) => {
      await runBrowserFill(context, { sessionId, selector: 'input[type="password"]', value: 'admin123' });

      const result = await runBrowserExpect(context, {
        sessionId,
        kind: 'value',
        selector: 'input[type="password"]',
        expected: 'admin123',
      });

      expect(result).toMatchObject({ passed: true, expected: '[redacted]', observed: '[redacted]' });
      const stored = await readFile(join(context.engine.projectRoot, '.qa', result.evidence.path), 'utf-8');
      expect(stored).not.toContain('admin123');
    }, 'login');
  }, 30_000);

  it('counts elements, passing and failing', async () => {
    await withContext(async (context, sessionId) => {
      const right = await runBrowserExpect(context, {
        sessionId,
        kind: 'count',
        selector: 'form input',
        expected: 2,
      });
      const wrong = await runBrowserExpect(context, {
        sessionId,
        kind: 'count',
        selector: 'form input',
        expected: 5,
        ...SHORT,
      });

      expect(right).toMatchObject({ passed: true, observed: 2 });
      expect(wrong).toMatchObject({ passed: false, expected: 5, observed: 2 });
    }, 'login');
  }, 30_000);

  it('checks a checkbox state, passing and failing', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addCheckbox);

      const checked = await runBrowserExpect(context, { sessionId, kind: 'checked', selector: '#agree' });
      const notChecked = await runBrowserExpect(context, {
        sessionId,
        kind: 'checked',
        selector: '#agree',
        expected: false,
        ...SHORT,
      });

      expect(checked).toMatchObject({ passed: true, observed: true });
      expect(notChecked).toMatchObject({ passed: false, expected: false, observed: true });
    }, 'login');
  }, 30_000);

  it('checks the page URL, passing and failing', async () => {
    await withContext(async (context, sessionId) => {
      const right = await runBrowserExpect(context, { sessionId, kind: 'url', expected: '/login' });
      const wrong = await runBrowserExpect(context, {
        sessionId,
        kind: 'url',
        expected: '/dashboard',
        ...SHORT,
      });

      expect(right).toMatchObject({ passed: true, observed: `${BASE_URL}login` });
      expect(wrong).toMatchObject({ passed: false, observed: `${BASE_URL}login` });
    }, 'login');
  }, 30_000);

  it('waits for an element that shows up after the check began', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addBannerSoon);

      const result = await runBrowserExpect(context, {
        sessionId,
        kind: 'text',
        selector: '#late',
        expected: 'Arrived',
        timeoutMs: 5000,
      });

      expect(result).toMatchObject({ passed: true, observed: 'Arrived' });
    }, 'login');
  }, 30_000);
});
