// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { findGridRow, type GridNavigationMode } from '../browser-grid.js';
import { QaError } from '../errors.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  runBrowserWidgetAction,
  type BrowserWidgetActionOptions,
  type BrowserWidgetActionResult,
} from './browser-widget-action.js';

export interface BrowserGridFindRowOptions extends BrowserWidgetActionOptions {
  /** The column header, exactly as the grid shows it. */
  readonly column: string;
  /** The cell text that identifies the row, exactly as the grid shows it. */
  readonly value: string;
  readonly maxSteps?: number;
}

export interface GridCell {
  readonly column: string;
  readonly text: string;
}

export interface BrowserGridFindRowResult extends BrowserWidgetActionResult {
  /** A Playwright selector for the row, valid while it is rendered; paging or scrolling away drops it. */
  readonly rowSelector: string;
  readonly cells: readonly GridCell[];
  readonly navigation: {
    readonly mode: GridNavigationMode;
    readonly pageChanges: number;
    readonly scrolls: number;
  };
}

/**
 * MCP `qa.browser_grid_find_row` (P6-44): finds the row with `value` under the `column` header,
 * paging or scrolling to reach it when the grid does not render every row, and reads its cells.
 * Cell text is page data and comes back capped.
 */
export function runBrowserGridFindRow(
  context: BrowserOperationContext,
  options: BrowserGridFindRowOptions,
): Promise<BrowserGridFindRowResult> {
  return runBrowserWidgetAction<Omit<BrowserGridFindRowResult, keyof BrowserWidgetActionResult>>(
    context,
    options,
    {
      type: 'grid-find-row',
      valueLength: options.value.length,
      async perform(session) {
        const match = await findGridRow(session, options.selector, options);
        return {
          rowSelector: match.rowSelector,
          cells: match.cells.map((text, index) => ({
            column: match.state.headers[index] ?? '',
            text,
          })),
          navigation: { mode: match.mode, pageChanges: match.pageChanges, scrolls: match.scrolls },
        };
      },
    },
  );
}

export interface BrowserGridReadCellOptions extends BrowserGridFindRowOptions {
  /** The header of the column whose cell to read. */
  readonly cellColumn: string;
}

export interface BrowserGridReadCellResult extends BrowserWidgetActionResult {
  readonly cellText: string;
  /** A Playwright selector for the cell, valid while its row is rendered. */
  readonly cellSelector: string;
  readonly rowSelector: string;
  readonly navigation: BrowserGridFindRowResult['navigation'];
}

/**
 * MCP `qa.browser_grid_read_cell` (P6-44): finds a row as `qa.browser_grid_find_row` does and
 * returns the cell under another column's header.
 */
export function runBrowserGridReadCell(
  context: BrowserOperationContext,
  options: BrowserGridReadCellOptions,
): Promise<BrowserGridReadCellResult> {
  return runBrowserWidgetAction<Omit<BrowserGridReadCellResult, keyof BrowserWidgetActionResult>>(
    context,
    options,
    {
      type: 'grid-read-cell',
      valueLength: options.value.length,
      async perform(session) {
        const match = await findGridRow(session, options.selector, options);
        const cellIndex = match.state.headers.indexOf(options.cellColumn) + 1;
        if (cellIndex === 0) {
          throw new QaError(
            'BROWSER_GRID_COLUMN_NOT_FOUND',
            `"${options.selector}" has no "${options.cellColumn}" column`,
            { remediation: 'Use a column header exactly as the grid shows it.' },
          );
        }
        return {
          cellText: match.cells[cellIndex - 1] ?? '',
          cellSelector: `${match.rowSelector} >> css=[role="gridcell"]:nth-child(${String(cellIndex)})`,
          rowSelector: match.rowSelector,
          navigation: { mode: match.mode, pageChanges: match.pageChanges, scrolls: match.scrolls },
        };
      },
    },
  );
}
