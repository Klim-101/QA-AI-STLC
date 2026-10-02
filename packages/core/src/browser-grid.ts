// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { waitForBusyToClear } from './browser-busy-wait.js';
import { readGridState, scrollGridTo, type GridState } from './browser-grid-page.js';
import type { BrowserSession } from './browser-session-store.js';
import { resolveWidget } from './browser-widget.js';
import { QaError } from './errors.js';

const POLL_INTERVAL_MS = 50;
const SETTLE_AFTER_MOVE_MS = 2_000;
export const DEFAULT_GRID_MAX_STEPS = 200;
/** A scroll step is a little less than the viewport, so no row falls between two views. */
const SCROLL_STEP_RATIO = 0.8;
const HEADER_LIST_CAP = 20;

export type GridNavigationMode = 'single' | 'paged' | 'virtual';

export interface GridRowMatch {
  /** The grid wrapper, as a Playwright selector. */
  readonly root: string;
  /** A Playwright selector for the row, valid while that row is rendered. */
  readonly rowSelector: string;
  readonly state: GridState;
  /** The cell texts of the matched row, capped. */
  readonly cells: readonly string[];
  readonly mode: GridNavigationMode;
  readonly pageChanges: number;
  readonly scrolls: number;
}

export interface FindGridRowOptions {
  readonly column: string;
  readonly value: string;
  /** Most pages or scroll steps to visit before giving up. */
  readonly maxSteps?: number;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function rowSelectorFor(root: string, columnIndex: number, value: string): string {
  return `${root} >> css=[role="row"]:has(> [role="gridcell"]:nth-child(${String(columnIndex)}):text-is(${quote(value)}))`;
}

async function readState(
  session: BrowserSession,
  root: string,
  options: FindGridRowOptions,
  previousSignature?: string,
): Promise<GridState> {
  const timeoutMs = Math.min(session.actionTimeoutMs, SETTLE_AFTER_MOVE_MS);
  const state = await session.page.locator(root).evaluate(
    readGridState,
    {
      targets: session.widgetTargets,
      column: options.column,
      value: options.value,
      ...(previousSignature === undefined ? {} : { previousSignature }),
      timeoutMs,
      pollIntervalMs: POLL_INTERVAL_MS,
    },
    { timeout: session.actionTimeoutMs + timeoutMs },
  );
  return state as GridState;
}

function notFound(selector: string, options: FindGridRowOptions, steps: number): QaError {
  return new QaError(
    'BROWSER_GRID_ROW_NOT_FOUND',
    `No row of "${selector}" has "${options.value}" in the "${options.column}" column after visiting ${String(steps)} page(s) or scroll position(s)`,
    {
      remediation:
        'Check the value against the grid, including case and spacing; the row may not exist, which can itself be the finding.',
    },
  );
}

/**
 * Finds the row whose cell under the `column` header holds `value`, moving through the grid when it
 * does not render every row: a grid with a pager is searched page by page (first rewinding to its
 * first page), one with a scroll container that renders only the rows near the viewport by scrolling
 * it from the top. The search is bounded by `maxSteps`, and a value found in more than one rendered
 * row is an error rather than a guess, since a selector could not tell the rows apart.
 */
export async function findGridRow(
  session: BrowserSession,
  selector: string,
  options: FindGridRowOptions,
): Promise<GridRowMatch> {
  const maxSteps = options.maxSteps ?? DEFAULT_GRID_MAX_STEPS;
  await waitForBusyToClear(session);
  const { root } = await resolveWidget(session, selector);
  let state = await readState(session, root, options);
  if (state.columnIndex === 0) {
    throw new QaError(
      'BROWSER_GRID_COLUMN_NOT_FOUND',
      `"${selector}" has no "${options.column}" column; its columns are ${
        state.headers
          .slice(0, HEADER_LIST_CAP)
          .map((header) => `"${header}"`)
          .join(', ') || 'none'
      }`,
      { remediation: 'Use a column header exactly as the grid shows it.' },
    );
  }

  const mode: GridNavigationMode = state.hasPager ? 'paged' : state.scroll === null ? 'single' : 'virtual';
  let pageChanges = 0;
  let scrolls = 0;
  const found = (): GridRowMatch => {
    if (state.matchCount > 1) {
      throw new QaError(
        'BROWSER_GRID_ROW_AMBIGUOUS',
        `${String(state.matchCount)} rendered rows of "${selector}" have "${options.value}" in the "${options.column}" column`,
        { remediation: 'Match on a column whose values are unique.' },
      );
    }
    return {
      root,
      rowSelector: rowSelectorFor(root, state.columnIndex, options.value),
      state,
      cells: state.cells,
      mode,
      pageChanges,
      scrolls,
    };
  };

  if (state.matchCount > 0) {
    return found();
  }

  if (mode === 'paged') {
    const movePage = async (selectorInGrid: string): Promise<void> => {
      await session.page.click(`${root} >> css=${selectorInGrid}`, { timeout: session.actionTimeoutMs });
      state = await readState(session, root, options, state.signature);
      await waitForBusyToClear(session);
      pageChanges += 1;
    };
    while (state.canGoPrevious && pageChanges < maxSteps) {
      await movePage(state.previousSelector);
      if (state.matchCount > 0) {
        return found();
      }
    }
    while (state.canGoNext && pageChanges < maxSteps) {
      await movePage(state.nextSelector);
      if (state.matchCount > 0) {
        return found();
      }
    }
    throw notFound(selector, options, pageChanges + 1);
  }

  if (mode === 'virtual') {
    const moveTo = async (top: number): Promise<void> => {
      await session.page
        .locator(root)
        .evaluate(
          scrollGridTo,
          { targets: session.widgetTargets, top },
          { timeout: session.actionTimeoutMs },
        );
      state = await readState(session, root, options, state.signature);
      await waitForBusyToClear(session);
      scrolls += 1;
    };
    if ((state.scroll?.top ?? 0) > 0) {
      await moveTo(0);
      if (state.matchCount > 0) {
        return found();
      }
    }
    while (state.scroll !== null && scrolls < maxSteps) {
      const { top, clientHeight, scrollHeight } = state.scroll;
      if (top + clientHeight >= scrollHeight - 1) {
        break;
      }
      await moveTo(top + Math.floor(clientHeight * SCROLL_STEP_RATIO));
      if (state.matchCount > 0) {
        return found();
      }
    }
    throw notFound(selector, options, scrolls + 1);
  }

  throw notFound(selector, options, 1);
}
