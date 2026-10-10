// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserClick } from '../src/operations/browser-click.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserTabs } from '../src/operations/browser-tabs.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4414;
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
  openOptions: Parameters<typeof runBrowserOpen>[1],
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
      const { sessionId } = await runBrowserOpen(context, { environment: 'staging', ...openOptions });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}login` });
      await run(context, sessionId);
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

interface FixtureNode {
  id: string;
  textContent: string;
  target: string;
  href: string;
  onclick: (() => void) | null;
}

interface FixturePage {
  document: {
    createElement(tag: string): FixtureNode;
    querySelector(selector: string): { append(node: unknown): void } | null;
  };
  confirm(message: string): boolean;
  answer: string;
}

interface FixtureLinks {
  readonly sameHost: string;
  readonly otherHost: string;
}

// Runs inside the page, where nothing from this module exists.
function addFixture(links: FixtureLinks): void {
  const page = globalThis as unknown as FixturePage;
  const main = page.document.querySelector('main');
  const ask = page.document.createElement('button');
  ask.id = 'ask';
  ask.textContent = 'Delete everything';
  ask.onclick = () => {
    page.answer = String(page.confirm('Delete everything?'));
  };
  main?.append(ask);
  for (const [id, href] of [
    ['same', links.sameHost],
    ['other', links.otherHost],
  ] as const) {
    const link = page.document.createElement('a');
    link.id = id;
    link.textContent = id;
    link.target = '_blank';
    link.href = href;
    main?.append(link);
  }
}

// The browser announces a new page late on a loaded machine (4 s measured while the whole suite
// ran in parallel). The wait ends at the announcement, so a generous deadline costs nothing.
const TAB_DEADLINE_MS = 20_000;

const LINKS: FixtureLinks = {
  sameHost: `${BASE_URL}login#second-tab`,
  // The same server, reached under a host the environment does not allow.
  otherHost: `http://127.0.0.1:${String(PORT)}/login`,
};

function readAnswer(): unknown {
  return (globalThis as unknown as FixturePage).answer;
}

async function recordsOfType(
  context: BrowserOperationContext,
  runId: string,
  type: string,
): Promise<unknown[]> {
  const directory = join(context.engine.projectRoot, '.qa', 'evidence', runId);
  const records: unknown[] = [];
  for (const name of await readdir(directory)) {
    if (name.endsWith('.json')) {
      const record = JSON.parse(await readFile(join(directory, name), 'utf-8')) as { type?: string };
      if (record.type === type) {
        records.push(record);
      }
    }
  }
  return records;
}

describe('dialogs and tabs on the demo app', () => {
  it('dismisses a confirm, records it, and reports it in the result of the click', async () => {
    await withContext({}, async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addFixture, LINKS);

      const result = await runBrowserClick(context, { sessionId, selector: '#ask', stepId: 'step-3' });

      expect(result.notices).toEqual([
        {
          kind: 'dialog',
          tabId: 'tab-1',
          dialogKind: 'confirm',
          message: 'Delete everything?',
          handled: 'dismissed',
        },
      ]);
      // A dismissed confirm returns false to the page, which is how the application saw the policy.
      expect(await session.page.evaluate(readAnswer)).toBe('false');
      expect(await recordsOfType(context, session.runId, 'dialog')).toEqual([
        expect.objectContaining({
          type: 'dialog',
          tabId: 'tab-1',
          dialog: { kind: 'confirm', message: 'Delete everything?', handled: 'dismissed' },
        }) as unknown,
      ]);
      // Reported once: the next result carries no notices.
      expect((await runBrowserTabs(context, { sessionId })).notices).toEqual([]);
    });
  }, 30_000);

  it('accepts a confirm when the session policy says so', async () => {
    await withContext({ dialogPolicy: 'accept' }, async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addFixture, LINKS);

      const result = await runBrowserClick(context, { sessionId, selector: '#ask' });

      expect(result.notices).toMatchObject([{ kind: 'dialog', handled: 'accepted' }]);
      expect(await session.page.evaluate(readAnswer)).toBe('true');
    });
  }, 30_000);

  it('lists a page a link opened and switches to it', async () => {
    await withContext({}, async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addFixture, LINKS);
      const firstPage = session.page;

      await runBrowserClick(context, { sessionId, selector: '#same' });
      const listed = await runBrowserTabs(context, { sessionId, settleMs: TAB_DEADLINE_MS });

      expect(listed.tabs.map((tab) => [tab.tabId, tab.active])).toEqual([
        ['tab-1', true],
        ['tab-2', false],
      ]);
      expect(listed.tabs[1]?.url).toBe(LINKS.sameHost);

      const switched = await runBrowserTabs(context, { sessionId, switchTo: 'tab-2', stepId: 'step-4' });

      expect(switched.activeTabId).toBe('tab-2');
      expect(session.page).not.toBe(firstPage);
      expect(session.page.url()).toBe(LINKS.sameHost);
      expect(await recordsOfType(context, session.runId, 'tab-switch')).toEqual([
        expect.objectContaining({ tabId: 'tab-2', stepId: 'step-4' }) as unknown,
      ]);
      expect(await recordsOfType(context, session.runId, 'tab-opened')).toHaveLength(1);

      await expect(runBrowserTabs(context, { sessionId, switchTo: 'tab-9' })).rejects.toMatchObject({
        code: 'BROWSER_TAB_NOT_FOUND',
      });
    });
  }, 30_000);

  it('closes a page that opened off the allowlist and reports it', async () => {
    await withContext({}, async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(addFixture, LINKS);

      const click = await runBrowserClick(context, { sessionId, selector: '#other' });
      const listed = await runBrowserTabs(context, { sessionId, settleMs: TAB_DEADLINE_MS });

      expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
      expect([...(click.notices ?? []), ...listed.notices]).toMatchObject([
        { kind: 'tab-blocked', url: expect.stringContaining('127.0.0.1') as unknown },
      ]);
      expect(session.activeTabId).toBe('tab-1');
      // Safe mode aborted the popup's very first request, so nothing reached the other host.
      expect(session.blockedRequests.map((request) => request.url)).toEqual([
        expect.stringContaining('127.0.0.1') as unknown,
      ]);
      expect(await recordsOfType(context, session.runId, 'tab-blocked')).toHaveLength(1);
      expect(await recordsOfType(context, session.runId, 'tab-opened')).toHaveLength(0);
    });
  }, 30_000);
});
