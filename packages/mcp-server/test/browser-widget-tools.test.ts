// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserSessionStore } from '@qa-ai-stlc/core';
import {
  createFakeBrowserLauncher,
  type FakeLocatorEvaluateCall,
} from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeEngineContext } from '../src/engine-context.js';
import { createBrowserOpenTool } from '../src/tools/browser-open.js';
import { createBrowserClosePopupTool, createBrowserOpenPopupTool } from '../src/tools/browser-popup.js';
import { createBrowserSelectOptionTool } from '../src/tools/browser-select-option.js';
import { createBrowserSetDateTool } from '../src/tools/browser-set-date.js';
import type { BrowserToolDependencies } from '../src/tools/browser-dependencies.js';

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'ui: { componentLibrary: kendo-angular }',
  '',
].join('\n');

const CLOSED = { depth: 0, isOpen: false, popupId: 'list-1', toggleSelector: null };
const OPEN = { ...CLOSED, isOpen: true };

// Plays the page the widget page functions run in: each call is answered by the function's name.
function scriptedPage(options: {
  readonly inspections: readonly unknown[];
  readonly displayedText?: string;
  readonly inputValue?: string;
}): (call: FakeLocatorEvaluateCall) => unknown {
  let inspectionIndex = 0;
  return ({ functionName }) => {
    switch (functionName) {
      case 'inspectWidget': {
        const inspection = options.inspections[Math.min(inspectionIndex, options.inspections.length - 1)];
        inspectionIndex += 1;
        return inspection;
      }
      case 'waitForPopupState':
        return true;
      case 'readOptionSelected':
        return 'false';
      case 'readDisplayedText':
        return options.displayedText;
      case 'readInputValue':
        return options.inputValue;
      default:
        return undefined;
    }
  };
}

describe('qa.browser_* widget tools (real filesystem, temp project directory)', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  async function inProject(
    locatorEvaluate: (call: FakeLocatorEvaluateCall) => unknown,
    run: (dependencies: BrowserToolDependencies, sessionId: string) => Promise<void>,
  ): Promise<void> {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
      const launcher = createFakeBrowserLauncher({ locatorEvaluate, evaluateResult: null });
      const dependencies: BrowserToolDependencies = {
        sessions: new BrowserSessionStore(),
        createContext: () => ({ ...createNodeEngineContext(), browserLauncher: launcher }),
      };
      try {
        const { sessionId } = await createBrowserOpenTool(dependencies).handler({ environment: 'staging' });
        await run(dependencies, sessionId);
      } finally {
        // Windows will not remove a directory that is the working directory.
        process.chdir(originalCwd);
      }
    });
  }

  it('gives a session the widgets of the configured component library', async () => {
    await inProject(scriptedPage({ inspections: [CLOSED] }), async (dependencies, sessionId) => {
      const session = await dependencies.sessions.get(sessionId);

      expect(session.widgetTargets).toContainEqual({
        wrapperSelector: 'kendo-combobox',
        popupToggleSelector: '.k-input-button',
      });
      expect(session.widgetTargets).toContainEqual({ wrapperSelector: 'kendo-dropdownlist' });
      expect(session.widgetTargets.map((target) => target.wrapperSelector)).not.toContain('kendo-grid');
    });
  }, 30_000);

  it('selects an option and returns the evidence of the action', async () => {
    await inProject(
      scriptedPage({ inspections: [OPEN, OPEN, CLOSED], displayedText: 'Casey' }),
      async (dependencies, sessionId) => {
        const result = await createBrowserSelectOptionTool(dependencies).handler({
          sessionId,
          selector: 'kendo-combobox',
          optionText: 'Casey',
          stepId: 'step-4',
        });

        expect(result).toMatchObject({ sessionId, selector: 'kendo-combobox' });
        expect(result.evidence).toMatchObject({ kind: 'action', stepId: 'step-4' });
      },
    );
  }, 30_000);

  it('sets a date', async () => {
    await inProject(
      scriptedPage({ inspections: [CLOSED], inputValue: '2031-04-15' }),
      async (dependencies, sessionId) => {
        const result = await createBrowserSetDateTool(dependencies).handler({
          sessionId,
          selector: 'kendo-datepicker',
          value: '2031-04-15',
        });

        expect(result.evidence.kind).toBe('action');
      },
    );
  }, 30_000);

  it('reports a date the widget did not keep as a coded error', async () => {
    await inProject(
      scriptedPage({ inspections: [CLOSED], inputValue: '' }),
      async (dependencies, sessionId) => {
        await expect(
          createBrowserSetDateTool(dependencies).handler({
            sessionId,
            selector: 'kendo-datepicker',
            value: '2031-04-15',
          }),
        ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_VALUE_MISMATCH' });
      },
    );
  }, 30_000);

  it('opens and closes a popup', async () => {
    await inProject(
      scriptedPage({ inspections: [CLOSED, OPEN, OPEN, CLOSED] }),
      async (dependencies, sessionId) => {
        const opened = await createBrowserOpenPopupTool(dependencies).handler({
          sessionId,
          selector: 'kendo-combobox',
        });
        const closed = await createBrowserClosePopupTool(dependencies).handler({
          sessionId,
          selector: 'kendo-combobox',
        });

        expect(opened.evidence.kind).toBe('action');
        expect(closed.evidence.id).not.toBe(opened.evidence.id);
      },
    );
  }, 30_000);
});
