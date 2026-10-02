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
import { createBrowserGridFindRowTool, createBrowserGridReadCellTool } from '../src/tools/browser-grid.js';
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

function gridPage(state: unknown): (call: FakeLocatorEvaluateCall) => unknown {
  return ({ functionName }) => {
    switch (functionName) {
      case 'inspectWidget':
        return { depth: 0, isOpen: false, popupId: null, toggleSelector: null };
      case 'readGridState':
        return state;
      default:
        return undefined;
    }
  };
}

describe('qa.browser_grid_* tools (real filesystem, temp project directory)', () => {
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

  const HIT = {
    headers: ['ID', 'Name'],
    columnIndex: 1,
    rowCount: 10,
    matchCount: 1,
    cells: ['25', 'Avery'],
    signature: 'hit',
    hasPager: false,
    nextSelector: '',
    previousSelector: '',
    canGoNext: false,
    canGoPrevious: false,
    scroll: null,
  };

  it('gives a session the grid navigation of the configured component library', async () => {
    await inProject(gridPage(HIT), async (dependencies, sessionId) => {
      const session = await dependencies.sessions.get(sessionId);

      expect(session.widgetTargets).toContainEqual(
        expect.objectContaining({
          wrapperSelector: 'kendo-grid',
          grid: expect.objectContaining({ scrollContainerSelector: '.k-grid-container' }) as unknown,
        }),
      );
    });
  }, 30_000);

  it('finds a row and returns its cells and a selector for it', async () => {
    await inProject(gridPage(HIT), async (dependencies, sessionId) => {
      const result = await createBrowserGridFindRowTool(dependencies).handler({
        sessionId,
        selector: 'kendo-grid',
        column: 'ID',
        value: '25',
        stepId: 'step-5',
      });

      expect(result.cells).toEqual([
        { column: 'ID', text: '25' },
        { column: 'Name', text: 'Avery' },
      ]);
      expect(result.navigation.mode).toBe('single');
      expect(result.evidence).toMatchObject({ kind: 'action', stepId: 'step-5' });
    });
  }, 30_000);

  it('reads one cell of the row, passing the step limit on', async () => {
    await inProject(gridPage(HIT), async (dependencies, sessionId) => {
      const result = await createBrowserGridReadCellTool(dependencies).handler({
        sessionId,
        selector: 'kendo-grid',
        column: 'ID',
        value: '25',
        cellColumn: 'Name',
        maxSteps: 5,
      });

      expect(result.cellText).toBe('Avery');
      expect(result.cellSelector).toContain('nth-child(2)');
    });
  }, 30_000);

  it('reports a column the grid does not have as a coded error', async () => {
    await inProject(gridPage({ ...HIT, columnIndex: 0 }), async (dependencies, sessionId) => {
      await expect(
        createBrowserGridFindRowTool(dependencies).handler({
          sessionId,
          selector: 'kendo-grid',
          column: 'Salary',
          value: '1',
        }),
      ).rejects.toMatchObject({ code: 'BROWSER_GRID_COLUMN_NOT_FOUND' });
    });
  }, 30_000);
});
