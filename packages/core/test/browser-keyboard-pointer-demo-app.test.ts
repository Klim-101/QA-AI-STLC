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
import { runBrowserCheck } from '../src/operations/browser-check.js';
import { runBrowserExpect } from '../src/operations/browser-expect.js';
import { runBrowserFill } from '../src/operations/browser-fill.js';
import { runBrowserHover } from '../src/operations/browser-hover.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserPress } from '../src/operations/browser-press.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4411;
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

interface PageElement {
  checked: boolean;
  id: string;
  name: string;
  type: string;
  textContent: string | null;
  append(node: unknown): void;
  addEventListener(type: string, listener: () => void): void;
}

interface PageDocument {
  createElement(tag: string): PageElement;
  querySelector(selector: string): PageElement | null;
}

// These run inside the page, where nothing from this module exists, so each one reads `document`
// for itself.
function addControls(): void {
  const { document } = globalThis as unknown as { document: PageDocument };
  const form = document.querySelector('form');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'agree';
  form?.append(checkbox);
  for (const value of ['a', 'b']) {
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'choice';
    radio.id = `choice-${value}`;
    form?.append(radio);
  }
  const menu = document.createElement('div');
  menu.id = 'menu';
  menu.textContent = 'Menu';
  const tip = document.createElement('p');
  tip.id = 'tip';
  menu.addEventListener('mouseenter', () => {
    tip.textContent = 'Tooltip shown';
  });
  const main = document.querySelector('main');
  main?.append(menu);
  main?.append(tip);
}

const SHORT = { timeoutMs: 300 } as const;

describe('qa.browser_press, qa.browser_hover and qa.browser_check on the demo app', () => {
  it('blocks the POST that Enter on the login form sets off, and records it', async () => {
    await withContext(async (context, sessionId) => {
      await runBrowserFill(context, { sessionId, selector: '#email', value: 'admin@example.com' });
      await runBrowserFill(context, { sessionId, selector: 'input[type="password"]', value: 'admin123' });

      const pressed = await runBrowserPress(context, {
        sessionId,
        key: 'Enter',
        selector: 'input[type="password"]',
        stepId: 'step-3',
      });

      const session = await context.sessions.get(sessionId);
      expect(session.blockedRequests).toHaveLength(1);
      expect(session.blockedRequests[0]).toMatchObject({ method: 'POST' });
      expect(session.blockedRequests[0]?.url).toContain('/login');
      const record: unknown = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', pressed.evidence.path), 'utf-8'),
      );
      expect(record).toMatchObject({
        type: 'press',
        key: 'Enter',
        stepId: 'step-3',
        selector: 'input[type="password"]',
      });
      expect(JSON.stringify(record)).not.toContain('admin123');
    });
  }, 30_000);

  it('presses a key on the page when no element is named, and never records a lone character', async () => {
    await withContext(async (context, sessionId) => {
      await runBrowserFill(context, { sessionId, selector: '#email', value: '' });

      const typed = await runBrowserPress(context, { sessionId, key: 'Control+a' });
      await runBrowserPress(context, { sessionId, key: 'q', selector: '#email' });

      expect(typed.key).toBe('Control+a');
      const session = await context.sessions.get(sessionId);
      expect(session.blockedRequests).toEqual([]);
      const typedValue = await runBrowserExpect(context, {
        sessionId,
        kind: 'value',
        selector: '#email',
        expected: 'q',
      });
      expect(typedValue.passed).toBe(true);
      const record = await readFile(join(context.engine.projectRoot, '.qa', typed.evidence.path), 'utf-8');
      expect(record).not.toContain('selector');
    });
  }, 30_000);

  it('hovers an element, which shows what only a hover shows', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addControls);
      const before = await runBrowserExpect(context, {
        sessionId,
        kind: 'text',
        selector: '#tip',
        expected: 'Tooltip shown',
        ...SHORT,
      });

      const hovered = await runBrowserHover(context, { sessionId, selector: '#menu' });
      const after = await runBrowserExpect(context, {
        sessionId,
        kind: 'text',
        selector: '#tip',
        expected: 'Tooltip shown',
      });

      expect(before.passed).toBe(false);
      expect(after.passed).toBe(true);
      expect(hovered.evidence).toMatchObject({ kind: 'action' });
    });
  }, 30_000);

  it('checks and unchecks a checkbox and reads the state back', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addControls);

      const on = await runBrowserCheck(context, { sessionId, selector: '#agree', stepId: 'step-2' });
      const stillOn = await runBrowserCheck(context, { sessionId, selector: '#agree' });
      const off = await runBrowserCheck(context, { sessionId, selector: '#agree', checked: false });

      expect(on.checked).toBe(true);
      expect(stillOn.checked).toBe(true);
      expect(off.checked).toBe(false);
      const record: unknown = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', on.evidence.path), 'utf-8'),
      );
      expect(record).toMatchObject({ type: 'check', checked: true, stepId: 'step-2', selector: '#agree' });
    });
  }, 30_000);

  it('selects a radio, and fails honestly when a radio cannot be unchecked', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addControls);

      const picked = await runBrowserCheck(context, { sessionId, selector: '#choice-a' });
      const refused = await runBrowserCheck(context, {
        sessionId,
        selector: '#choice-a',
        checked: false,
      }).catch((caught: unknown) => caught);

      expect(picked.checked).toBe(true);
      expect(refused).toBeInstanceOf(Error);
    });
  }, 30_000);
});
