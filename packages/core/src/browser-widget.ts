// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { waitForBusyToClear } from './browser-busy-wait.js';
import type { BrowserSession } from './browser-session-store.js';
import {
  dismissWithEscape,
  inspectWidget,
  readDisplayedText,
  waitForPopupState,
  type WidgetInspection,
} from './browser-widget-page.js';
import { QaError } from './errors.js';

const POLL_INTERVAL_MS = 50;
const SETTLE_AFTER_ACTION_MS = 1_000;
const DISPLAYED_TEXT_PREVIEW_CHARS = 120;

/** A widget found on the page: a selector for its wrapper and what the page showed for it. */
export interface ResolvedWidget {
  /** A Playwright selector for the wrapper, which the caller's own selector may point inside of. */
  readonly root: string;
  readonly inspection: WidgetInspection;
}

/**
 * Finds the widget wrapper for a selector (see `inspectWidget`) and what its popup is doing.
 * The wrapper is addressed by climbing from the caller's selector, never by marking the page.
 */
export async function resolveWidget(session: BrowserSession, selector: string): Promise<ResolvedWidget> {
  const result = await session.page
    .locator(selector)
    .evaluate(inspectWidget, { targets: session.widgetTargets }, { timeout: session.actionTimeoutMs });
  const inspection = result as WidgetInspection;
  const climb = Array.from({ length: inspection.depth }, () => '..').join('/');
  const root = inspection.depth === 0 ? selector : `${selector} >> xpath=${climb}`;
  return { root, inspection };
}

async function waitForPopup(
  session: BrowserSession,
  root: string,
  wantOpen: boolean,
  timeoutMs: number,
): Promise<boolean> {
  const reached = await session.page
    .locator(root)
    .evaluate(
      waitForPopupState,
      { wantOpen, timeoutMs, pollIntervalMs: POLL_INTERVAL_MS },
      { timeout: session.actionTimeoutMs + 1_000 },
    );
  return reached === true;
}

/**
 * Brings a widget's popup to the wanted state, acting only when it is not there already, so
 * opening an open popup (or closing a closed one) is a safe retry. Returns the widget as the page
 * shows it afterwards.
 *
 * Opening clicks the widget's toggle. Closing first sends Escape, which every keyboard-operable
 * widget honours and which works for widgets (a multi-select) whose toggle only ever opens, then
 * falls back to the toggle. A popup that has just changed state ignores input while its animation
 * runs, so a popup that did not follow an action gets the next one before the final full wait.
 */
export async function setWidgetPopup(
  session: BrowserSession,
  selector: string,
  wantOpen: boolean,
): Promise<ResolvedWidget> {
  await waitForBusyToClear(session);
  const widget = await resolveWidget(session, selector);
  if (widget.inspection.isOpen !== wantOpen) {
    const toggle =
      widget.inspection.toggleSelector === null
        ? widget.root
        : `${widget.root} >> css=${widget.inspection.toggleSelector}`;
    const clickToggle = (): Promise<void> => session.page.click(toggle, { timeout: session.actionTimeoutMs });
    const pressEscape = async (): Promise<void> => {
      await session.page
        .locator(widget.root)
        .evaluate(dismissWithEscape, undefined, { timeout: session.actionTimeoutMs });
    };
    const attempts = wantOpen ? [clickToggle, clickToggle] : [pressEscape, clickToggle, clickToggle];
    let reached = false;
    for (const [index, attempt] of attempts.entries()) {
      await attempt();
      const isLastAttempt = index === attempts.length - 1;
      reached = await waitForPopup(
        session,
        widget.root,
        wantOpen,
        isLastAttempt ? session.actionTimeoutMs : Math.min(session.actionTimeoutMs, SETTLE_AFTER_ACTION_MS),
      );
      if (reached) {
        break;
      }
    }
    if (!reached) {
      throw new QaError(
        'BROWSER_WIDGET_POPUP_STATE',
        `The popup of "${selector}" did not ${wantOpen ? 'open' : 'close'} within ${String(session.actionTimeoutMs)} ms`,
        {
          remediation:
            'Check that the selector points at the widget, and that the component library selected in ui.componentLibrary matches the page.',
        },
      );
    }
  }
  await waitForBusyToClear(session);
  return resolveWidget(session, selector);
}

function quoteForSelector(value: string): string {
  return JSON.stringify(value);
}

/** The Playwright selector of the popup the widget controls, or of any listbox when it names none. */
export function popupScopeSelector(inspection: WidgetInspection): string {
  return inspection.popupId === null
    ? 'css=[role="listbox"]:visible'
    : `css=[id=${quoteForSelector(inspection.popupId)}]`;
}

/** The Playwright selector of the option whose whole text is `optionText`, inside the widget's popup. */
export function optionSelector(inspection: WidgetInspection, optionText: string): string {
  const text = quoteForSelector(optionText);
  // An option usually wraps its text in an element of its own, and `:text-is` only matches the
  // innermost element holding the text, so the option is found through either shape.
  return `${popupScopeSelector(inspection)} >> css=[role="option"]:text-is(${text}), [role="option"]:has(:text-is(${text}))`;
}

/** Reads what the widget displays and fails when `expected` is not part of it. */
export async function verifyDisplayedText(
  session: BrowserSession,
  widget: ResolvedWidget,
  selector: string,
  expected: string,
): Promise<void> {
  const displayed = await session.page
    .locator(widget.root)
    .evaluate(readDisplayedText, undefined, { timeout: session.actionTimeoutMs });
  const text = typeof displayed === 'string' ? displayed : '';
  if (!text.includes(expected)) {
    throw valueMismatch(selector, expected, text);
  }
}

export function valueMismatch(selector: string, expected: string, actual: string): QaError {
  const preview = actual.replace(/\s+/g, ' ').trim().slice(0, DISPLAYED_TEXT_PREVIEW_CHARS);
  return new QaError(
    'BROWSER_WIDGET_VALUE_MISMATCH',
    `"${selector}" does not show "${expected}" after the action; it shows "${preview}"`,
    {
      remediation:
        'The widget did not take the value. If the application should have, this is a defect to report; otherwise check the text or format against what the widget accepts.',
    },
  );
}
