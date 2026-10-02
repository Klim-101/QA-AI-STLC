// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Everything in this file runs inside the page under test, where nothing from the surrounding
// module exists, and this package compiles without DOM types: each function types the few DOM
// members it touches for itself. The browser's own V8 instance is invisible to Node coverage, so
// real-browser tests (`test/browser-widget-demo-app.test.ts`) are what exercise it.
/* v8 ignore start */

import type { WidgetTarget } from './browser-session-store.js';

interface PageElement {
  readonly innerText: string;
  readonly value?: string;
  getAttribute(name: string): string | null;
  readonly parentElement: PageElement | null;
  matches(selector: string): boolean;
  contains(other: PageElement): boolean;
  querySelector(selector: string): PageElement | null;
  querySelectorAll(selector: string): ArrayLike<PageElement>;
  getClientRects(): ArrayLike<unknown>;
  dispatchEvent(event: unknown): boolean;
  blur(): void;
}

export interface WidgetInspection {
  /** How many levels up from the located element the widget wrapper is: 0 when it is the wrapper itself. */
  readonly depth: number;
  readonly isOpen: boolean;
  /** The id of the popup the widget controls (`aria-controls`, else `aria-owns`), when it names one. */
  readonly popupId: string | null;
  /** The profile's popup toggle that exists inside this widget, when the profile declares one. */
  readonly toggleSelector: string | null;
}

export interface InspectWidgetArgs {
  readonly targets: readonly WidgetTarget[];
}

/**
 * Finds the widget the located element belongs to and reports its popup state. A locator built
 * from the accessibility tree often resolves to a control inside the widget (the input a combo
 * box renders), so the wrapper is looked for upward from it; with no profile target above it, the
 * element itself stands for the widget.
 */
export function inspectWidget(element: PageElement, rawArgs: unknown): WidgetInspection {
  const args = rawArgs as InspectWidgetArgs;
  let root = element;
  let depth = 0;
  let target: WidgetTarget | undefined;
  for (
    let current: PageElement | null = element, level = 0;
    current !== null;
    current = current.parentElement, level += 1
  ) {
    const candidate: PageElement = current;
    const found = args.targets.find((widget) => candidate.matches(widget.wrapperSelector));
    if (found !== undefined) {
      root = candidate;
      depth = level;
      target = found;
      break;
    }
  }
  const nodes = [root, ...Array.from(root.querySelectorAll('[aria-expanded], [aria-controls], [aria-owns]'))];
  const isOpen = nodes.some((node) => node.getAttribute('aria-expanded') === 'true');
  const popupId =
    nodes
      .map((node) => node.getAttribute('aria-controls') ?? node.getAttribute('aria-owns'))
      .find((id) => id !== null && id !== '') ?? null;
  const toggleSelector = target?.popupToggleSelector ?? null;
  return {
    depth,
    isOpen,
    popupId,
    toggleSelector:
      toggleSelector !== null && root.querySelector(toggleSelector) !== null ? toggleSelector : null,
  };
}

export interface WaitForPopupArgs {
  readonly wantOpen: boolean;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

/** Resolves `true` once the widget's popup is in the wanted state, `false` when the timeout passes first. */
export async function waitForPopupState(element: PageElement, rawArgs: unknown): Promise<boolean> {
  const args = rawArgs as WaitForPopupArgs;
  const isOpen = (): boolean =>
    [element, ...Array.from(element.querySelectorAll('[aria-expanded]'))].some(
      (node) => node.getAttribute('aria-expanded') === 'true',
    );
  const deadline = Date.now() + args.timeoutMs;
  while (isOpen() !== args.wantOpen && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs));
  }
  return isOpen() === args.wantOpen;
}

/** `aria-selected` of one option, which a multi-select list keeps true for every chosen option. */
export function readOptionSelected(element: PageElement): string | null {
  return element.getAttribute('aria-selected');
}

/**
 * The text a user can read off the widget: its rendered text (a widget keeps the native control
 * it replaced hidden, and hidden text is not in `innerText`) plus the value of every visible input.
 */
export function readDisplayedText(element: PageElement): string {
  const inputValues = Array.from(element.querySelectorAll('input'))
    .filter((input) => input.getClientRects().length > 0)
    .map((input) => input.value ?? '');
  return [element.innerText, ...inputValues].join('\n');
}

export function readInputValue(element: PageElement): string {
  return element.value ?? '';
}

/** Fires the events a user typing then leaving a field would, which is when widgets parse their text. */
export function commitInput(element: PageElement): void {
  const { Event } = globalThis as unknown as {
    Event: new (type: string, init: { bubbles: boolean }) => unknown;
  };
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();
}

/** Sends Escape to whatever has focus inside the widget (the widget itself when nothing does). */
export function dismissWithEscape(element: PageElement): void {
  const { document, KeyboardEvent } = globalThis as unknown as {
    document: { activeElement: PageElement | null };
    KeyboardEvent: new (type: string, init: Record<string, unknown>) => unknown;
  };
  const focused = document.activeElement;
  const target = focused !== null && element.contains(focused) ? focused : element;
  const init = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true };
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
}

/* v8 ignore stop */
