// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Everything in this file runs inside the page under test, where nothing from the surrounding
// module exists, and this package compiles without DOM types: each function types the few DOM
// members it touches for itself. The browser's own V8 instance is invisible to Node coverage, so
// real-browser tests (`test/browser-widget-demo-app.test.ts`) are what exercise it.
/* v8 ignore start */

import type { DateEntry, WidgetTarget } from './browser-session-store.js';

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
  /** How the widget takes a date; `text` for a widget the profile does not describe. */
  readonly dateEntry: DateEntry;
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
    dateEntry: target?.dateEntry ?? 'text',
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

export interface WaitForAnimationsArgs {
  readonly timeoutMs: number;
}

interface PageAnimation {
  readonly finished: Promise<unknown>;
  readonly effect: { getComputedTiming(): { readonly endTime: number | string } } | null;
}

/**
 * Resolves once no finite animation is running on the page, or when the timeout passes first. A
 * list that is still animating open can drop an option click (it closes without choosing), and
 * Playwright's own stability check does not see every kind of animation. Endless animations (a
 * spinner) are not waited for.
 */
export async function waitForAnimations(_element: PageElement, rawArgs: unknown): Promise<void> {
  const args = rawArgs as WaitForAnimationsArgs;
  const { document, requestAnimationFrame } = globalThis as unknown as {
    document: { getAnimations(): PageAnimation[] };
    requestAnimationFrame: (callback: () => void) => unknown;
  };
  const deadline = Date.now() + args.timeoutMs;
  // A list that has just been attached starts its animation on the next frames; looking before then
  // finds none running.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
  const finite = (): PageAnimation[] =>
    document
      .getAnimations()
      .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
  for (let running = finite(); running.length > 0 && Date.now() < deadline; running = finite()) {
    await Promise.race([
      Promise.allSettled(running.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
    ]);
  }
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

interface SelectElement {
  readonly tagName: string;
  readonly multiple: boolean;
  readonly options: ArrayLike<{ readonly label: string; readonly selected: boolean }>;
}

/**
 * What a native select offers and has chosen, by the label a user reads; null when the
 * element is not a native select, which is how a widget is told from the control it replaces.
 */
export function inspectNativeSelect(rawElement: unknown): unknown {
  const element = rawElement as SelectElement;
  if (element.tagName !== 'SELECT') {
    return null;
  }
  const options = Array.from(element.options);
  return {
    isMultiple: element.multiple,
    optionLabels: options.map((option) => option.label),
    selectedLabels: options.filter((option) => option.selected).map((option) => option.label),
  };
}

/* v8 ignore stop */
