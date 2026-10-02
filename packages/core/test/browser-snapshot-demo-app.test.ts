// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserClick } from '../src/operations/browser-click.js';
import { runBrowserFill } from '../src/operations/browser-fill.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserSnapshot } from '../src/operations/browser-snapshot.js';
import { MAX_PAGE_VIEW_CHARS, PAGE_VIEW_BEGIN_MARKER } from '../src/page-view.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4409;
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
  await waitForServer(`${BASE_URL}kendo-jquery.html`, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
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

const PAGES = [
  '',
  'login',
  'dashboard',
  'tasks',
  'tasks/new',
  'a11y-fixture.html',
  'busy-fixture.html',
  'kendo-angular.html',
  'kendo-jquery.html',
  'token-demo.html',
] as const;

describe('qa.browser_snapshot on the demo app', () => {
  it.each(PAGES)(
    'fits the size cap and lists a ref per actionable node on /%s',
    async (page) => {
      await withContext(async (context, sessionId) => {
        const result = await runBrowserSnapshot(context, { sessionId });

        expect(result.screenshot).toBeUndefined();
        expect(result.view.text.length).toBeLessThanOrEqual(MAX_PAGE_VIEW_CHARS);
        expect(result.view.text.startsWith(PAGE_VIEW_BEGIN_MARKER)).toBe(true);
        // A long paragraph may be shortened (and reported); no line, hence no ref, may be dropped.
        expect(result.view.omittedLineCount).toBe(0);
        const refs = result.view.text.match(/\[ref=e\d+\]/g) ?? [];
        expect(refs).toHaveLength(result.view.refCount);
        expect(new Set(refs).size).toBe(refs.length);
      }, page);
    },
    30_000,
  );

  it('lists the login form controls as refs', async () => {
    await withContext(async (context, sessionId) => {
      const { view } = await runBrowserSnapshot(context, { sessionId });

      expect(view.refCount).toBeGreaterThanOrEqual(3);
      expect(view.text).toMatch(/- textbox "[^"]+" \[ref=e\d+\]/);
      expect(view.text).toMatch(/- button "[^"]+" \[ref=e\d+\]/);
    }, 'login');
  }, 30_000);
});

interface FormField {
  readonly value: string;
  readonly parentElement: { append(node: unknown): void } | null;
  cloneNode(deep: boolean): FormField;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
}

function readValue(field: FormField): string {
  return field.value;
}

// Appends a second field with the same role and accessible name, as a page that re-renders a form can.
function duplicateField(field: FormField): void {
  const copy = field.cloneNode(true);
  copy.removeAttribute('id');
  copy.setAttribute('aria-label', 'Email');
  field.parentElement?.append(copy);
}

function refOf(outline: string, pattern: RegExp): string {
  const ref = pattern.exec(outline)?.[1];
  if (ref === undefined) {
    throw new Error(`No ref matching ${String(pattern)} in the outline`);
  }
  return ref;
}

const EMAIL_FIELD = /textbox "Email" \[ref=(e\d+)\]/;
const LOGIN_BUTTON = /button "Log in" \[ref=(e\d+)\]/;

describe('element refs on the demo app', () => {
  it('fills and clicks by ref, and records the selector each ref resolved to', async () => {
    await withContext(async (context, sessionId) => {
      const { view } = await runBrowserSnapshot(context, { sessionId });
      const emailRef = refOf(view.text, EMAIL_FIELD);
      const buttonRef = refOf(view.text, LOGIN_BUTTON);

      const filled = await runBrowserFill(context, {
        sessionId,
        ref: emailRef,
        value: 'admin@example.com',
        stepId: 'step-1',
      });
      const clicked = await runBrowserClick(context, { sessionId, ref: buttonRef, stepId: 'step-2' });

      const session = await context.sessions.get(sessionId);
      expect(await session.page.locator('#email').evaluate(readValue)).toBe('admin@example.com');
      expect(filled.selector).toBe('role=textbox[name="Email"s]');
      expect(clicked.selector).toBe('role=button[name="Log in"s]');
      const record: unknown = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', clicked.evidence.path), 'utf-8'),
      );
      expect(record).toMatchObject({
        type: 'click',
        selector: 'role=button[name="Log in"s]',
        ref: { id: buttonRef, role: 'button', name: 'Log in' },
        stepId: 'step-2',
      });
    }, 'login');
  }, 30_000);

  it('refuses a ref after a navigation, and one from a snapshot that has been replaced', async () => {
    await withContext(async (context, sessionId) => {
      const first = await runBrowserSnapshot(context, { sessionId });
      const buttonRef = refOf(first.view.text, LOGIN_BUTTON);

      await runBrowserSnapshot(context, { sessionId });
      await expect(runBrowserClick(context, { sessionId, ref: buttonRef })).rejects.toMatchObject({
        code: 'BROWSER_REF_STALE',
      });

      const second = await runBrowserSnapshot(context, { sessionId });
      const freshRef = refOf(second.view.text, LOGIN_BUTTON);
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}login` });
      await expect(runBrowserClick(context, { sessionId, ref: freshRef })).rejects.toMatchObject({
        code: 'BROWSER_REF_STALE',
      });
    }, 'login');
  }, 30_000);

  it('refuses a ref whose role and name no longer find exactly one element', async () => {
    await withContext(async (context, sessionId) => {
      const { view } = await runBrowserSnapshot(context, { sessionId });
      const emailRef = refOf(view.text, EMAIL_FIELD);
      const session = await context.sessions.get(sessionId);
      await session.page.locator('#email').evaluate(duplicateField);

      await expect(runBrowserClick(context, { sessionId, ref: emailRef })).rejects.toMatchObject({
        code: 'BROWSER_REF_STALE',
      });
    }, 'login');
  }, 30_000);
});
