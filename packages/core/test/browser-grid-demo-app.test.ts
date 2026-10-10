// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore, type WidgetTarget } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserGridFindRow, runBrowserGridReadCell } from '../src/operations/browser-grid.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4405;
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
  widgetTargets: readonly WidgetTarget[],
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
        resolveLibraryWidgets: () => widgetTargets,
      });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}${page}` });
      await run(context, sessionId);
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

const JQUERY_TARGETS: WidgetTarget[] = [
  {
    wrapperSelector: 'div.k-grid',
    grid: {
      nextPageSelector: '[aria-label="Go to the next page"]',
      previousPageSelector: '[aria-label="Go to the previous page"]',
      scrollContainerSelector: '.k-grid-content',
    },
  },
];
const ANGULAR_TARGETS: WidgetTarget[] = [
  {
    wrapperSelector: 'kendo-grid',
    grid: {
      nextPageSelector: '[aria-label="Go to the next page"]',
      previousPageSelector: '[aria-label="Go to the previous page"]',
      scrollContainerSelector: '.k-grid-container',
    },
  },
];

function readText(element: { textContent: string | null }): string | null {
  return element.textContent;
}

interface Person {
  readonly id: number;
  readonly name: string;
  readonly department: string;
}

async function personAt(index: number): Promise<Person> {
  const response = await fetch(`${BASE_URL}api/kendo/people?skip=${String(index)}&take=1`);
  const { items } = (await response.json()) as { items: Person[] };
  const [person] = items;
  if (person === undefined) {
    throw new Error(`No person at ${String(index)}`);
  }
  return person;
}

describe.each([
  {
    flavor: 'Kendo UI for jQuery',
    page: 'kendo-jquery.html',
    targets: JQUERY_TARGETS,
    wrapper: 'div.k-grid',
  },
  {
    flavor: 'Kendo UI for Angular',
    page: 'kendo-angular.html',
    targets: ANGULAR_TARGETS,
    wrapper: 'kendo-grid',
  },
])('grid actions on the $flavor fixture', ({ page, targets, wrapper }) => {
  it('finds a row on the third page of a paged grid and reads its cells', async () => {
    const person = await personAt(24);
    await withContext(
      targets,
      async (context, sessionId) => {
        const result = await runBrowserGridFindRow(context, {
          sessionId,
          selector: `${wrapper}#paged-grid`,
          column: 'ID',
          value: String(person.id),
        });

        expect(result.navigation).toMatchObject({ mode: 'paged', pageChanges: 2, scrolls: 0 });
        expect(result.cells).toEqual([
          { column: 'ID', text: String(person.id) },
          { column: 'Name', text: person.name },
          { column: 'Department', text: person.department },
        ]);
        const session = await context.sessions.get(sessionId);
        await expect(session.page.locator(result.rowSelector).count()).resolves.toBe(1);
      },
      page,
    );
  }, 90_000);

  it('finds a row outside the rendered rows of a virtualized grid by scrolling', async () => {
    const person = await personAt(99);
    await withContext(
      targets,
      async (context, sessionId) => {
        const result = await runBrowserGridFindRow(context, {
          sessionId,
          selector: `${wrapper}#virtual-grid`,
          column: 'ID',
          value: String(person.id),
        });

        expect(result.navigation.mode).toBe('virtual');
        expect(result.navigation.scrolls).toBeGreaterThan(5);
        expect(result.cells[1]).toEqual({ column: 'Name', text: person.name });
      },
      page,
    );
  }, 90_000);

  it('reads a cell by column and returns a selector for it', async () => {
    const person = await personAt(24);
    await withContext(
      targets,
      async (context, sessionId) => {
        const result = await runBrowserGridReadCell(context, {
          sessionId,
          selector: `${wrapper}#paged-grid`,
          column: 'Name',
          value: person.name,
          cellColumn: 'Department',
          stepId: 'step-2',
        });

        expect(result.cellText).toBe(person.department);
        expect(result.evidence.stepId).toBe('step-2');
        const session = await context.sessions.get(sessionId);
        await expect(session.page.locator(result.cellSelector).count()).resolves.toBe(1);
        await expect(session.page.locator(result.cellSelector).evaluate(readText)).resolves.toBe(
          person.department,
        );
      },
      page,
    );
  }, 90_000);

  it('searches back from a later page, and reports a row the grid does not have', async () => {
    const first = await personAt(0);
    await withContext(
      targets,
      async (context, sessionId) => {
        const selector = `${wrapper}#paged-grid`;
        await runBrowserGridFindRow(context, { sessionId, selector, column: 'ID', value: '55' });

        const back = await runBrowserGridFindRow(context, {
          sessionId,
          selector,
          column: 'ID',
          value: String(first.id),
        });
        expect(back.navigation.pageChanges).toBeGreaterThan(0);

        // BUG-013: the last row of the data set is never served, so the grid never shows it.
        await expect(
          runBrowserGridFindRow(context, { sessionId, selector, column: 'ID', value: '117' }),
        ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
      },
      page,
    );
  }, 90_000);

  it('refuses a missing column and a value that is not unique in its column', async () => {
    await withContext(
      targets,
      async (context, sessionId) => {
        const selector = `${wrapper}#paged-grid`;
        await expect(
          runBrowserGridFindRow(context, { sessionId, selector, column: 'Salary', value: '1' }),
        ).rejects.toMatchObject({ code: 'BROWSER_GRID_COLUMN_NOT_FOUND' });

        const first = await personAt(0);
        await expect(
          runBrowserGridFindRow(context, {
            sessionId,
            selector,
            column: 'Department',
            value: first.department,
          }),
        ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_AMBIGUOUS' });
      },
      page,
    );
  }, 90_000);

  it('gives up after the step limit', async () => {
    await withContext(
      targets,
      async (context, sessionId) => {
        await expect(
          runBrowserGridFindRow(context, {
            sessionId,
            selector: `${wrapper}#paged-grid`,
            column: 'ID',
            value: '100',
            maxSteps: 2,
          }),
        ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
      },
      page,
    );
  }, 90_000);
});
