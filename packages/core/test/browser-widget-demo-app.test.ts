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
import { runBrowserClosePopup, runBrowserOpenPopup } from '../src/operations/browser-popup.js';
import { runBrowserSelectOption } from '../src/operations/browser-select-option.js';
import { runBrowserSetDate } from '../src/operations/browser-set-date.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4403;
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

// These run in the browser, where nothing from this module is available, and this package
// compiles without DOM types: each one types the page's `document` for itself.
interface FixtureDocument {
  getElementById(id: string): { textContent: string | null } | null;
}

function readSummary(): string | null | undefined {
  const { document } = globalThis as unknown as { document: FixtureDocument };
  return document.getElementById('selection-summary')?.textContent;
}

describe('widget actions on the Kendo UI for jQuery fixture', () => {
  const toggle = '.k-input-button, .k-select';
  const toggles: WidgetTarget[] = [
    { wrapperSelector: 'span.k-dropdownlist' },
    { wrapperSelector: 'span.k-combobox', popupToggleSelector: toggle },
    { wrapperSelector: 'span.k-multiselect' },
    { wrapperSelector: 'span.k-datepicker', popupToggleSelector: toggle },
  ];

  it('finds the widget wrapper from the control inside it that an accessibility locator resolves to', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'role=combobox[name="Assignee"]',
          optionText: 'Devon',
        });
        await runBrowserSetDate(context, {
          sessionId,
          selector: 'role=combobox[name="Due date (today or later)"]',
          value: '2031-04-15',
        });

        const session = await context.sessions.get(sessionId);
        expect(await session.page.evaluate(readSummary)).toBe('Priority low, assignee Devon, 0 tag(s).');
      },
      'kendo-jquery.html',
    );
  }, 90_000);

  it('selects an option of a drop-down, a combo box and a multi-select by visible text', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'span.k-dropdownlist',
          optionText: 'High',
        });
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'span.k-combobox',
          optionText: 'Casey',
        });
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'span.k-multiselect',
          optionText: 'billing',
        });
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'span.k-multiselect',
          optionText: 'urgent',
        });
        // Picking a chosen option again must not un-pick it.
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'span.k-multiselect',
          optionText: 'billing',
        });

        const session = await context.sessions.get(sessionId);
        expect(await session.page.evaluate(readSummary)).toBe('Priority high, assignee Casey, 2 tag(s).');
      },
      'kendo-jquery.html',
    );
  }, 90_000);

  it('sets a date and registers the action as evidence without the date itself', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        const result = await runBrowserSetDate(context, {
          sessionId,
          selector: 'span.k-datepicker',
          value: '2031-04-15',
          stepId: 'step-2',
        });

        expect(result.evidence.kind).toBe('action');
        expect(result.evidence.stepId).toBe('step-2');
      },
      'kendo-jquery.html',
    );
  }, 90_000);

  it('fails with a coded error for an option the list does not have', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await expect(
          runBrowserSelectOption(context, {
            sessionId,
            selector: 'span.k-dropdownlist',
            optionText: 'Critical',
          }),
        ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_OPTION_NOT_FOUND' });
      },
      'kendo-jquery.html',
    );
  }, 90_000);

  it('opens and closes a popup, and repeating either is harmless', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await runBrowserOpenPopup(context, { sessionId, selector: 'span.k-combobox' });
        await runBrowserOpenPopup(context, { sessionId, selector: 'span.k-combobox' });
        await runBrowserClosePopup(context, { sessionId, selector: 'span.k-combobox' });
        await runBrowserClosePopup(context, { sessionId, selector: 'span.k-combobox' });
      },
      'kendo-jquery.html',
    );
  }, 90_000);
});

describe('widget actions on the Kendo UI for Angular fixture', () => {
  const toggles: WidgetTarget[] = [
    { wrapperSelector: 'kendo-dropdownlist' },
    { wrapperSelector: 'kendo-combobox', popupToggleSelector: '.k-input-button' },
    { wrapperSelector: 'kendo-multiselect' },
    { wrapperSelector: 'kendo-datepicker', popupToggleSelector: '.k-input-button', dateEntry: 'digits' },
  ];

  it('selects an option of a combo box and a multi-select by visible text', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await runBrowserSelectOption(context, { sessionId, selector: 'kendo-combobox', optionText: 'Casey' });
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'kendo-multiselect',
          optionText: 'billing',
        });
        await runBrowserSelectOption(context, {
          sessionId,
          selector: 'kendo-multiselect',
          optionText: 'urgent',
        });

        const session = await context.sessions.get(sessionId);
        expect(await session.page.evaluate(readSummary)).toBe('Status none, owner Casey, 2 label(s).');
      },
      'kendo-angular.html',
    );
  }, 90_000);

  it('reports the drop-down that updates its model but never its displayed text (BUG-017)', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await expect(
          runBrowserSelectOption(context, { sessionId, selector: 'kendo-dropdownlist', optionText: 'Done' }),
        ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_VALUE_MISMATCH' });
      },
      'kendo-angular.html',
    );
  }, 90_000);

  it('sets a date', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await runBrowserSetDate(context, { sessionId, selector: 'kendo-datepicker', value: '15.04.2031' });
        // Typing over a date that is already there replaces it.
        await runBrowserSetDate(context, { sessionId, selector: 'kendo-datepicker', value: '01.09.2026' });
      },
      'kendo-angular.html',
    );
  }, 90_000);

  it('reports the segmented date input that garbles a date filled in at once', async () => {
    await withContext(
      [{ wrapperSelector: 'kendo-datepicker', popupToggleSelector: '.k-input-button' }],
      async (context, sessionId) => {
        await expect(
          runBrowserSetDate(context, { sessionId, selector: 'kendo-datepicker', value: '15.04.2031' }),
        ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_VALUE_MISMATCH' });
      },
      'kendo-angular.html',
    );
  }, 90_000);

  it('opens and closes a popup', async () => {
    await withContext(
      toggles,
      async (context, sessionId) => {
        await runBrowserOpenPopup(context, { sessionId, selector: 'kendo-datepicker' });
        await runBrowserClosePopup(context, { sessionId, selector: 'kendo-datepicker' });
      },
      'kendo-angular.html',
    );
  }, 90_000);
});
