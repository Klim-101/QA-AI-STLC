// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Everything in this file runs inside the page under test, where nothing from the surrounding
// module exists, and this package compiles without DOM types: each function types the few DOM
// members it touches for itself and is self-contained, because Playwright serializes it into the
// page on its own. The browser's own V8 instance is invisible to Node coverage, so the real-browser
// test (`test/browser-grid-demo-app.test.ts`) is what exercises it.
/* v8 ignore start */

import type { WidgetTarget } from './browser-session-store.js';

interface GridElement {
  readonly textContent: string | null;
  readonly children: ArrayLike<GridElement>;
  readonly disabled?: boolean;
  scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  getAttribute(name: string): string | null;
  matches(selector: string): boolean;
  querySelector(selector: string): GridElement | null;
  querySelectorAll(selector: string): ArrayLike<GridElement>;
}

export interface GridStateArgs {
  readonly targets: readonly WidgetTarget[];
  readonly column: string;
  readonly value: string;
  /** When given, waits until the rendered rows differ from this signature, or the timeout passes. */
  readonly previousSignature?: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

export interface GridState {
  /** Column header texts, in order, capped. */
  readonly headers: readonly string[];
  /** 1-based position of the wanted column among the headers, 0 when there is no such header. */
  readonly columnIndex: number;
  readonly rowCount: number;
  /** How many rendered rows hold the wanted value in the wanted column. */
  readonly matchCount: number;
  /** Cell texts of the first matching row, capped; empty when no rendered row matches. */
  readonly cells: readonly string[];
  /** Identifies the rendered rows, so a caller can tell when paging or scrolling changed them. */
  readonly signature: string;
  readonly hasPager: boolean;
  /** The selectors the pager buttons are found by; empty when the grid declares none, and then the matching `canGo` flag is false. */
  readonly nextSelector: string;
  readonly previousSelector: string;
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  /** Scroll position of a container that holds more rows than it shows, null when it does not scroll. */
  readonly scroll: {
    readonly top: number;
    readonly clientHeight: number;
    readonly scrollHeight: number;
  } | null;
}

/** Reads the grid's rendered rows and navigation controls, optionally after waiting for them to change. */
export async function readGridState(element: GridElement, rawArgs: unknown): Promise<GridState> {
  const args = rawArgs as GridStateArgs;
  const MAX_HEADERS = 50;
  const MAX_CELLS = 50;
  const MAX_TEXT_CHARS = 200;
  const controls =
    args.targets.find((target) => target.grid !== undefined && element.matches(target.wrapperSelector))
      ?.grid ?? null;
  const normalize = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();
  const isDisabled = (control: GridElement | null): boolean =>
    control === null || control.disabled === true || control.getAttribute('aria-disabled') === 'true';

  const snapshot = (): GridState => {
    const headers = Array.from(element.querySelectorAll('[role="columnheader"]'))
      .slice(0, MAX_HEADERS)
      .map((header) => normalize(header.textContent).slice(0, MAX_TEXT_CHARS));
    const columnIndex = headers.indexOf(normalize(args.column)) + 1;
    const rows = Array.from(element.querySelectorAll('[role="row"]'))
      .map((row) => Array.from(row.children).filter((cell) => cell.getAttribute('role') === 'gridcell'))
      .filter((cells) => cells.length > 0);
    const matching = rows.filter(
      (cells) =>
        columnIndex > 0 && normalize(cells[columnIndex - 1]?.textContent ?? null) === normalize(args.value),
    );
    const first = rows[0];
    const last = rows[rows.length - 1];
    const rowText = (cells: GridElement[] | undefined): string =>
      (cells ?? [])
        .map((cell) => normalize(cell.textContent))
        .join('/')
        .slice(0, MAX_TEXT_CHARS);
    const next =
      controls?.nextPageSelector === undefined ? null : element.querySelector(controls.nextPageSelector);
    const previous =
      controls?.previousPageSelector === undefined
        ? null
        : element.querySelector(controls.previousPageSelector);
    const container =
      controls?.scrollContainerSelector === undefined
        ? null
        : element.querySelector(controls.scrollContainerSelector);
    const scrolls = container !== null && container.scrollHeight > container.clientHeight + 1;
    return {
      headers,
      columnIndex,
      rowCount: rows.length,
      matchCount: matching.length,
      cells: (matching[0] ?? [])
        .slice(0, MAX_CELLS)
        .map((cell) => normalize(cell.textContent).slice(0, MAX_TEXT_CHARS)),
      signature: [rows.length, rowText(first), rowText(last)].join('|'),
      hasPager: next !== null,
      nextSelector: controls?.nextPageSelector ?? '',
      previousSelector: controls?.previousPageSelector ?? '',
      canGoNext: !isDisabled(next),
      canGoPrevious: !isDisabled(previous),
      scroll: scrolls
        ? {
            top: container.scrollTop,
            clientHeight: container.clientHeight,
            scrollHeight: container.scrollHeight,
          }
        : null,
    };
  };

  let state = snapshot();
  if (args.previousSignature !== undefined) {
    const deadline = Date.now() + args.timeoutMs;
    while (state.signature === args.previousSignature && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs));
      state = snapshot();
    }
  }
  return state;
}

export interface ScrollGridArgs {
  readonly targets: readonly WidgetTarget[];
  readonly top: number;
}

/** Scrolls the grid's scroll container to the given offset, so a virtualized grid renders the rows there. */
export function scrollGridTo(element: GridElement, rawArgs: unknown): void {
  const args = rawArgs as ScrollGridArgs;
  const selector = args.targets.find(
    (target) => target.grid !== undefined && element.matches(target.wrapperSelector),
  )?.grid?.scrollContainerSelector;
  const container = selector === undefined ? null : element.querySelector(selector);
  if (container !== null) {
    container.scrollTop = args.top;
  }
}

/* v8 ignore stop */
