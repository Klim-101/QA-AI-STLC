// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BrowserSessionStore,
  type AuthBrowser,
  type AuthBrowserContext,
  type AuthPage,
  type BrowserLauncher,
  type PageLocator,
  type PageResponse,
  type RouteHandler,
} from '@qa-ai-stlc/core';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeEngineContext } from '../src/engine-context.js';
import { createBrowserAccessibilityScanTool } from '../src/tools/browser-accessibility-scan.js';
import { createBrowserClickTool } from '../src/tools/browser-click.js';
import { createBrowserCloseTool } from '../src/tools/browser-close.js';
import { createBrowserFillTool } from '../src/tools/browser-fill.js';
import { createBrowserNavigateTool } from '../src/tools/browser-navigate.js';
import { createBrowserOpenTool } from '../src/tools/browser-open.js';
import { createBrowserSnapshotTool } from '../src/tools/browser-snapshot.js';
import type { BrowserToolDependencies } from '../src/tools/browser-dependencies.js';
import { createRegistryExecuteRegisterTool } from '../src/tools/registry-execute-register.js';

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

const SCREENSHOT_BYTES = new TextEncoder().encode('png-bytes');
const RESPONSE: PageResponse = { status: () => 200 };

interface FakeBrowser {
  readonly launcher: BrowserLauncher;
  readonly routeHandlers: RouteHandler[];
  readonly calls: string[];
  closedBrowsers: number;
}

/**
 * A stand-in for a real browser. `@qa-ai-stlc/core` publishes its fakes only to its own tests, so
 * this package supplies its own, the way `@qa-ai-stlc/explorer` and the CLI do.
 */
function createFakeBrowser(): FakeBrowser {
  const routeHandlers: RouteHandler[] = [];
  const calls: string[] = [];
  const state = { closedBrowsers: 0 };
  let currentUrl = 'about:blank';
  const locator = (): PageLocator => ({ count: () => Promise.resolve(1) });

  const page: AuthPage = {
    goto: (url) => {
      calls.push(`goto ${url}`);
      currentUrl = url;
      return Promise.resolve(RESPONSE);
    },
    fill: (selector) => {
      calls.push(`fill ${selector}`);
      return Promise.resolve();
    },
    click: (selector) => {
      calls.push(`click ${selector}`);
      return Promise.resolve();
    },
    waitForLoadState: () => Promise.resolve(),
    route: (_pattern, handler) => {
      routeHandlers.push(handler);
      return Promise.resolve();
    },
    // Only `qa.browser_accessibility_scan` calls `evaluate` (it runs axe-core's injected `run()`),
    // so a fixed one-violation result is safe to return unconditionally here.
    evaluate: () => Promise.resolve({ violations: [{ id: 'color-contrast' }] }),
    ariaSnapshotJSON: () => Promise.resolve({ role: 'document', name: 'Staging home' }),
    addScriptTag: () => Promise.resolve(undefined),
    getByRole: locator,
    getByTestId: locator,
    getByLabel: locator,
    getByPlaceholder: locator,
    getByText: locator,
    locator,
    reload: () => Promise.resolve(RESPONSE),
    setViewportSize: () => Promise.resolve(),
    viewportSize: () => null,
    url: () => currentUrl,
    title: () => Promise.resolve('Staging home'),
    screenshot: () => Promise.resolve(SCREENSHOT_BYTES),
  };

  const context: AuthBrowserContext = {
    newPage: () => Promise.resolve(page),
    storageState: () => Promise.resolve({ cookies: [], origins: [] }),
    close: () => Promise.resolve(),
  };
  const browser: AuthBrowser = {
    newContext: () => Promise.resolve(context),
    contexts: () => [context],
    close: () => {
      state.closedBrowsers += 1;
      return Promise.resolve();
    },
  };

  return {
    routeHandlers,
    calls,
    get closedBrowsers() {
      return state.closedBrowsers;
    },
    set closedBrowsers(value: number) {
      state.closedBrowsers = value;
    },
    launcher: {
      launch: () => Promise.resolve(browser),
      connectOverCdp: () => Promise.resolve(browser),
    },
  };
}

function createDependencies(fake: FakeBrowser): BrowserToolDependencies {
  return {
    sessions: new BrowserSessionStore(),
    createContext: () => ({ ...createNodeEngineContext(), browserLauncher: fake.launcher }),
  };
}

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

// Driven against a real temporary project directory and the real Node filesystem adapter, so the
// evidence trail these tools promise is asserted on files that actually exist (AGENTS.md 13).
describe('qa.browser_* tools (real filesystem, temp project directory)', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('leaves a complete evidence trail for a whole exploratory session', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');

      const fake = createFakeBrowser();
      const dependencies = createDependencies(fake);
      const open = createBrowserOpenTool(dependencies);
      const navigate = createBrowserNavigateTool(dependencies);
      const click = createBrowserClickTool(dependencies);
      const fill = createBrowserFillTool(dependencies);
      const snapshot = createBrowserSnapshotTool(dependencies);
      const close = createBrowserCloseTool(dependencies);

      const opened = await open.handler({ environment: 'staging' });
      expect(opened.allowlist).toEqual(['staging.example.test']);
      expect(opened.environment).toBe('staging');

      const navigated = await navigate.handler({
        sessionId: opened.sessionId,
        url: 'https://staging.example.test/login',
      });
      expect(navigated.httpStatus).toBe(200);

      const refused = await navigate
        .handler({ sessionId: opened.sessionId, url: 'https://evil.test/' })
        .catch((caught: unknown) => caught);
      expect(refused).toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });

      const filled = await fill.handler({
        sessionId: opened.sessionId,
        selector: '#password',
        value: 'correct-horse',
      });
      expect(filled.valueLength).toBe('correct-horse'.length);

      const clicked = await click.handler({ sessionId: opened.sessionId, selector: '#submit' });
      expect(clicked.url).toBe('https://staging.example.test/login');

      // Safe mode still holds for whatever the click set off.
      for (const handler of fake.routeHandlers) {
        await handler({
          request: () => ({ method: () => 'POST', url: () => 'https://staging.example.test/session' }),
          abort: () => Promise.resolve(),
          continue: () => Promise.resolve(),
        });
      }

      const captured = await snapshot.handler({ sessionId: opened.sessionId });
      const closed = await close.handler({ sessionId: opened.sessionId });

      expect(closed.blockedRequests).toEqual([
        { method: 'POST', url: 'https://staging.example.test/session' },
      ]);
      expect(fake.closedBrowsers).toBe(1);
      expect(fake.calls).toEqual([
        'goto https://staging.example.test/login',
        'fill #password',
        'click #submit',
      ]);

      const runId = opened.runId;
      const everyRecord = [
        opened.evidence,
        navigated.evidence,
        filled.evidence,
        clicked.evidence,
        captured.screenshot,
        captured.accessibilityTree,
        closed.evidence,
      ];
      const manifest = JSON.parse(await readFile(join(projectRoot, '.qa', 'manifest.json'), 'utf-8')) as {
        artifacts: Record<string, { sha256: string }>;
      };

      for (const record of everyRecord) {
        expect(record.path.startsWith(`evidence/${runId}/`)).toBe(true);
        const bytes = await readFile(join(projectRoot, '.qa', ...record.path.split('/')));
        expect(sha256(bytes)).toBe(record.sha256);
        expect(manifest.artifacts[record.path]?.sha256).toBe(record.sha256);
      }

      // The fill's value never reaches disk, only its length (AGENTS.md 5.8).
      const fillRecord = await readFile(
        join(projectRoot, '.qa', ...filled.evidence.path.split('/')),
        'utf-8',
      );
      expect(fillRecord).not.toContain('correct-horse');
      expect(JSON.parse(fillRecord)).toMatchObject({ type: 'fill', valueLength: 13 });

      process.chdir(originalCwd);
    });
  });

  it('registers a screenshot for every snapshot, so no unregistered image can exist', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');

      const fake = createFakeBrowser();
      const dependencies = createDependencies(fake);
      const opened = await createBrowserOpenTool(dependencies).handler({});

      const captured = await createBrowserSnapshotTool(dependencies).handler({
        sessionId: opened.sessionId,
        fullPage: true,
      });

      expect(captured.screenshot.kind).toBe('screenshot');
      expect(captured.screenshot.sha256).toBe(sha256(SCREENSHOT_BYTES));
      const manifest = JSON.parse(await readFile(join(projectRoot, '.qa', 'manifest.json'), 'utf-8')) as {
        artifacts: Record<string, { sha256: string }>;
      };
      expect(manifest.artifacts[captured.screenshot.path]?.sha256).toBe(sha256(SCREENSHOT_BYTES));
      expect(manifest.artifacts[captured.accessibilityTree.path]).toBeDefined();

      await createBrowserCloseTool(dependencies).handler({ sessionId: opened.sessionId });
      process.chdir(originalCwd);
    });
  });

  it('rejects every tool call for a session that was never opened', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const dependencies = createDependencies(createFakeBrowser());
      const calls = [
        createBrowserNavigateTool(dependencies).handler({
          sessionId: 'session-gone',
          url: 'https://staging.example.test/',
        }),
        createBrowserClickTool(dependencies).handler({ sessionId: 'session-gone', selector: '#x' }),
        createBrowserFillTool(dependencies).handler({
          sessionId: 'session-gone',
          selector: '#x',
          value: 'y',
        }),
        createBrowserSnapshotTool(dependencies).handler({ sessionId: 'session-gone' }),
        createBrowserCloseTool(dependencies).handler({ sessionId: 'session-gone' }),
      ];

      for (const call of calls) {
        await expect(call).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
      }
      process.chdir(originalCwd);
    });
  });

  it('qa.registry_execute_register promotes an ad hoc element, then qa.browser_accessibility_scan registers a scan (P3-15)', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');

      const fake = createFakeBrowser();
      const dependencies = createDependencies(fake);
      const opened = await createBrowserOpenTool(dependencies).handler({ environment: 'staging' });

      const registered = await createRegistryExecuteRegisterTool(dependencies).handler({
        sessionId: opened.sessionId,
        selector: 'role=button[name="Log in"]',
        kind: 'button',
        name: 'Log in',
      });
      expect(registered.created).toBe(true);
      const registry = JSON.parse(
        await readFile(join(projectRoot, '.qa', 'selectors', 'registry.json'), 'utf-8'),
      ) as { elements: { elementId: string; source: string }[] };
      expect(registry.elements).toEqual([
        expect.objectContaining({ elementId: registered.elementId, source: 'execute' }),
      ]);

      const scanned = await createBrowserAccessibilityScanTool(dependencies).handler({
        sessionId: opened.sessionId,
      });
      const scanEvidence = JSON.parse(
        await readFile(join(projectRoot, '.qa', ...scanned.evidence.path.split('/')), 'utf-8'),
      ) as { violations: unknown[] };

      await createBrowserCloseTool(dependencies).handler({ sessionId: opened.sessionId });
      process.chdir(originalCwd);

      expect(scanned.violationCount).toBe(1);
      expect(scanEvidence.violations).toEqual([{ id: 'color-contrast' }]);
    });
  });
});
