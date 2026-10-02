// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FakeLocatorEvaluateCall } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GridState } from './browser-grid-page.js';
import { runBrowserGridFindRow, runBrowserGridReadCell } from './operations/browser-grid.js';
import { runBrowserOpen } from './operations/browser-open.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from './test-support/browser-session-harness.js';
import { CLOSED_WIDGET } from './test-support/widget-page-script.js';

const HEADERS = ['ID', 'Name', 'Department'];

function state(overrides: Partial<GridState> = {}): GridState {
  return {
    headers: HEADERS,
    columnIndex: 1,
    rowCount: 10,
    matchCount: 0,
    cells: [],
    signature: 'page-1',
    hasPager: false,
    nextSelector: '',
    previousSelector: '',
    canGoNext: false,
    canGoPrevious: false,
    scroll: null,
    ...overrides,
  };
}

const HIT = state({ matchCount: 1, cells: ['25', 'Avery', 'Support'], signature: 'hit' });
const PAGER = {
  hasPager: true,
  nextSelector: '.next',
  previousSelector: '.previous',
};

// Plays the grid page: each `readGridState` call answers with the next scripted state (the last
// one repeats), and a scroll or click is only recorded, since the script decides what comes next.
function gridPage(states: readonly GridState[]): {
  readonly handler: (call: FakeLocatorEvaluateCall) => unknown;
  readonly scrollTargets: number[];
  readonly reads: Record<string, unknown>[];
} {
  let index = 0;
  const scrollTargets: number[] = [];
  const reads: Record<string, unknown>[] = [];
  return {
    scrollTargets,
    reads,
    handler: ({ functionName, arg }) => {
      switch (functionName) {
        case 'inspectWidget':
          return CLOSED_WIDGET;
        case 'readGridState': {
          reads.push(arg as Record<string, unknown>);
          const next = states.slice(Math.min(index, states.length - 1))[0];
          index += 1;
          return next;
        }
        case 'scrollGridTo':
          scrollTargets.push((arg as { top: number }).top);
          return undefined;
        default:
          return undefined;
      }
    },
  };
}

async function openSession(states: readonly GridState[], actionTimeoutMs = 30_000) {
  const page = gridPage(states);
  const harness = createBrowserTestHarness({
    configYaml: BROWSER_TEST_CONFIG_YAML.replace(
      '"staging.example.test"] }',
      `"staging.example.test"], actionTimeoutMs: ${String(actionTimeoutMs)} }`,
    ),
    launcherOptions: { locatorEvaluate: page.handler },
  });
  const { sessionId } = await runBrowserOpen(harness.context, {
    resolveLibraryWidgets: () => [{ wrapperSelector: '.grid', grid: { nextPageSelector: '.next' } }],
  });
  return { harness, sessionId, page };
}

function clicks(harness: Awaited<ReturnType<typeof openSession>>['harness']): unknown[] {
  return harness.launcher.pageCalls.filter((call) => call.method === 'click').map((call) => call.args[0]);
}

const ROW_SELECTOR = '.grid >> css=[role="row"]:has(> [role="gridcell"]:nth-child(1):text-is("25"))';

describe('runBrowserGridFindRow', () => {
  it('finds a row that is already rendered, without paging or scrolling', async () => {
    const { harness, sessionId } = await openSession([HIT]);

    const result = await runBrowserGridFindRow(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });

    expect(result).toMatchObject({
      rowSelector: ROW_SELECTOR,
      cells: [
        { column: 'ID', text: '25' },
        { column: 'Name', text: 'Avery' },
        { column: 'Department', text: 'Support' },
      ],
      navigation: { mode: 'single', pageChanges: 0, scrolls: 0 },
    });
    expect(clicks(harness)).toEqual([]);
  });

  it('records the search by the length of the value, never the value, and carries the step', async () => {
    const { harness, sessionId } = await openSession([HIT]);

    const result = await runBrowserGridFindRow(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
      stepId: 'step-2',
    });

    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'grid-find-row',
      sessionId,
      stepId: 'step-2',
      selector: '.grid',
      url: 'about:blank',
      valueLength: 2,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('gives a cell without a header an empty column name', async () => {
    const { harness, sessionId } = await openSession([
      state({ matchCount: 1, cells: ['25', 'Avery', 'Support', 'extra'] }),
    ]);

    const result = await runBrowserGridFindRow(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });

    expect(result.cells.at(-1)).toEqual({ column: '', text: 'extra' });
  });

  it('pages forward to the row and clicks the next-page control of the grid each time', async () => {
    const { harness, sessionId, page } = await openSession([
      state({ ...PAGER, canGoNext: true }),
      state({ ...PAGER, canGoNext: true, canGoPrevious: true, signature: 'page-2' }),
      { ...HIT, ...PAGER, canGoNext: true, canGoPrevious: true },
    ]);

    const result = await runBrowserGridFindRow(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });

    expect(result.navigation).toEqual({ mode: 'paged', pageChanges: 2, scrolls: 0 });
    expect(clicks(harness)).toEqual(['.grid >> css=.next', '.grid >> css=.next']);
    expect(page.reads.map((read) => read.previousSignature)).toEqual([undefined, 'page-1', 'page-2']);
  });

  it('rewinds to the first page before it pages forward, and finds a row on a page it rewinds past', async () => {
    const start = state({ ...PAGER, canGoNext: true, canGoPrevious: true, signature: 'page-5' });
    const found = await openSession([
      start,
      state({ ...PAGER, canGoNext: true, canGoPrevious: true, signature: 'page-4' }),
      { ...HIT, ...PAGER, canGoNext: true, canGoPrevious: true },
    ]);

    const result = await runBrowserGridFindRow(found.harness.context, {
      sessionId: found.sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });
    expect(result.navigation.pageChanges).toBe(2);
    expect(clicks(found.harness)).toEqual(['.grid >> css=.previous', '.grid >> css=.previous']);

    const rewound = await openSession([
      start,
      state({ ...PAGER, canGoNext: true, signature: 'page-1' }),
      state({ ...PAGER, canGoNext: true, signature: 'page-2' }),
      { ...HIT, ...PAGER },
    ]);
    const forward = await runBrowserGridFindRow(rewound.harness.context, {
      sessionId: rewound.sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });
    expect(clicks(rewound.harness)).toEqual([
      '.grid >> css=.previous',
      '.grid >> css=.next',
      '.grid >> css=.next',
    ]);
    expect(forward.navigation.pageChanges).toBe(3);
  });

  it('reports a row the pager never reaches, after visiting every page', async () => {
    const { harness, sessionId } = await openSession([
      state({ ...PAGER, canGoNext: true }),
      state({ ...PAGER, canGoNext: true, signature: 'page-2' }),
      state({ ...PAGER, signature: 'page-3' }),
    ]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '999' }),
    ).rejects.toMatchObject({
      code: 'BROWSER_GRID_ROW_NOT_FOUND',
      message:
        'No row of ".grid" has "999" in the "ID" column after visiting 3 page(s) or scroll position(s)',
    });
  });

  it('stops paging at the step limit', async () => {
    const { harness, sessionId } = await openSession([state({ ...PAGER, canGoNext: true })]);

    await expect(
      runBrowserGridFindRow(harness.context, {
        sessionId,
        selector: '.grid',
        column: 'ID',
        value: '999',
        maxSteps: 3,
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
    expect(clicks(harness)).toHaveLength(3);
  });

  it('stops rewinding at the step limit', async () => {
    const { harness, sessionId } = await openSession([state({ ...PAGER, canGoPrevious: true })]);

    await expect(
      runBrowserGridFindRow(harness.context, {
        sessionId,
        selector: '.grid',
        column: 'ID',
        value: '999',
        maxSteps: 2,
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
    expect(clicks(harness)).toHaveLength(2);
  });

  const scrolling = (top: number, signature: string): GridState =>
    state({ signature, scroll: { top, clientHeight: 100, scrollHeight: 1_000 } });

  it('scrolls a virtualized grid from the top, a little less than a viewport at a time', async () => {
    const { harness, sessionId, page } = await openSession([
      scrolling(300, 's-300'),
      scrolling(0, 's-0'),
      scrolling(80, 's-80'),
      { ...HIT, scroll: { top: 160, clientHeight: 100, scrollHeight: 1_000 } },
    ]);

    const result = await runBrowserGridFindRow(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });

    expect(page.scrollTargets).toEqual([0, 80, 160]);
    expect(result.navigation).toEqual({ mode: 'virtual', pageChanges: 0, scrolls: 3 });
  });

  it('finds the row on the first view after scrolling back to the top', async () => {
    const { harness, sessionId } = await openSession([
      scrolling(300, 's-300'),
      { ...HIT, scroll: { top: 0, clientHeight: 100, scrollHeight: 1_000 } },
    ]);

    const result = await runBrowserGridFindRow(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
    });

    expect(result.navigation.scrolls).toBe(1);
  });

  it('reports a row below the last rendered position once the bottom is reached', async () => {
    const { harness, sessionId, page } = await openSession([
      scrolling(0, 's-0'),
      scrolling(500, 's-500'),
      scrolling(900, 's-900'),
    ]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '999' }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
    expect(page.scrollTargets).toEqual([80, 580]);
  });

  it('stops scrolling at the step limit', async () => {
    const { harness, sessionId, page } = await openSession([scrolling(0, 's-0')]);

    await expect(
      runBrowserGridFindRow(harness.context, {
        sessionId,
        selector: '.grid',
        column: 'ID',
        value: '999',
        maxSteps: 2,
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
    expect(page.scrollTargets).toHaveLength(2);
  });

  it('stops when the grid no longer scrolls after a step', async () => {
    const { harness, sessionId } = await openSession([scrolling(0, 's-0'), state({ signature: 's-1' })]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '999' }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });
  });

  it('reports a row missing from a grid that renders everything at once', async () => {
    const { harness, sessionId } = await openSession([state()]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '999' }),
    ).rejects.toMatchObject({
      code: 'BROWSER_GRID_ROW_NOT_FOUND',
      message: expect.stringContaining('after visiting 1 page(s)') as unknown,
    });
  });

  it('fails with BROWSER_GRID_COLUMN_NOT_FOUND, listing the columns the grid has', async () => {
    const { harness, sessionId } = await openSession([state({ columnIndex: 0 })]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'Salary', value: '1' }),
    ).rejects.toMatchObject({
      code: 'BROWSER_GRID_COLUMN_NOT_FOUND',
      message: '".grid" has no "Salary" column; its columns are "ID", "Name", "Department"',
    });
  });

  it('says a grid with no header cells has no columns', async () => {
    const { harness, sessionId } = await openSession([state({ columnIndex: 0, headers: [] })]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '1' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('its columns are none') as unknown });
  });

  it('refuses a value that more than one rendered row holds, rather than pick one', async () => {
    const { harness, sessionId } = await openSession([state({ matchCount: 2, cells: ['1', 'A', 'B'] })]);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '1' }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_AMBIGUOUS' });
  });

  it('records nothing when the row is not found', async () => {
    const { harness, sessionId } = await openSession([state()]);
    const { runId } = await harness.sessions.get(sessionId);
    const directory = join('project', '.qa', 'evidence', runId);
    const before = await harness.fs.listFiles(directory);

    await expect(
      runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '9' }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_ROW_NOT_FOUND' });

    expect(await harness.fs.listFiles(directory)).toEqual(before);
  });

  it('passes the session widget targets and the action timeout to the page', async () => {
    const { harness, sessionId, page } = await openSession([HIT], 5_000);

    await runBrowserGridFindRow(harness.context, { sessionId, selector: '.grid', column: 'ID', value: '25' });

    expect(page.reads[0]).toMatchObject({
      targets: [{ wrapperSelector: '.grid', grid: { nextPageSelector: '.next' } }],
      column: 'ID',
      value: '25',
      timeoutMs: 2_000,
    });
  });
});

describe('runBrowserGridReadCell', () => {
  it('returns the cell under the other column and a selector for it', async () => {
    const { harness, sessionId } = await openSession([HIT]);

    const result = await runBrowserGridReadCell(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
      cellColumn: 'Department',
    });

    expect(result).toMatchObject({
      cellText: 'Support',
      rowSelector: ROW_SELECTOR,
      cellSelector: `${ROW_SELECTOR} >> css=[role="gridcell"]:nth-child(3)`,
      navigation: { mode: 'single' },
    });
  });

  it('records a grid-read-cell action', async () => {
    const { harness, sessionId } = await openSession([HIT]);

    const result = await runBrowserGridReadCell(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
      cellColumn: 'Name',
    });

    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))),
    ).toMatchObject({
      type: 'grid-read-cell',
    });
  });

  it('fails with BROWSER_GRID_COLUMN_NOT_FOUND for a column the grid does not have', async () => {
    const { harness, sessionId } = await openSession([HIT]);

    await expect(
      runBrowserGridReadCell(harness.context, {
        sessionId,
        selector: '.grid',
        column: 'ID',
        value: '25',
        cellColumn: 'Salary',
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_GRID_COLUMN_NOT_FOUND' });
  });

  it('reads an empty text for a column whose cell the row does not have', async () => {
    const { harness, sessionId } = await openSession([
      state({ matchCount: 1, cells: ['25', 'Avery'], headers: HEADERS }),
    ]);

    const result = await runBrowserGridReadCell(harness.context, {
      sessionId,
      selector: '.grid',
      column: 'ID',
      value: '25',
      cellColumn: 'Department',
    });

    expect(result.cellText).toBe('');
  });
});
