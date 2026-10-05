// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FakeLocatorEvaluateCall } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import type { WidgetInspection } from '../browser-widget-page.js';

export const CLOSED_WIDGET: WidgetInspection = {
  depth: 0,
  isOpen: false,
  popupId: 'list-1',
  toggleSelector: '.toggle',
  dateEntry: 'text',
};

export const OPEN_WIDGET: WidgetInspection = { ...CLOSED_WIDGET, isOpen: true };

export interface WidgetPageScript {
  /** What each `inspectWidget` call sees, in order; the last repeats. */
  readonly inspections?: readonly WidgetInspection[];
  /** What each `waitForPopupState` call reports, in order; the last repeats. */
  readonly popupWaits?: readonly boolean[];
  /** `aria-selected` of the option, or an error for an option that never appears. */
  readonly optionSelected?: string | null | Error;
  readonly displayedText?: unknown;
  /** What each `readDisplayedText` call reads, in order, the last repeating; takes the place of `displayedText`. */
  readonly displayedTexts?: readonly unknown[];
  readonly inputValue?: unknown;
}

// The last entry repeats once the queue is used up.
function nextOf<TValue>(queue: readonly TValue[], index: number): TValue {
  return queue.slice(Math.min(index, queue.length - 1))[0] as TValue;
}

/**
 * Plays the page for the widget actions: the page functions run inside the browser in production,
 * so a unit test answers them by name instead.
 */
export function scriptWidgetPage(script: WidgetPageScript): (call: FakeLocatorEvaluateCall) => unknown {
  const counters = { inspection: 0, wait: 0, displayed: 0 };
  return ({ functionName }) => {
    switch (functionName) {
      case 'inspectWidget': {
        const inspection = nextOf(script.inspections ?? [CLOSED_WIDGET], counters.inspection);
        counters.inspection += 1;
        return inspection;
      }
      case 'waitForPopupState': {
        const reached = nextOf(script.popupWaits ?? [true], counters.wait);
        counters.wait += 1;
        return reached;
      }
      case 'readOptionSelected':
        if (script.optionSelected instanceof Error) {
          return Promise.reject(script.optionSelected);
        }
        return script.optionSelected;
      case 'readDisplayedText': {
        if (script.displayedTexts === undefined) {
          return script.displayedText;
        }
        const text = nextOf(script.displayedTexts, counters.displayed);
        counters.displayed += 1;
        return text;
      }
      case 'readInputValue':
        return script.inputValue;
      default:
        return undefined;
    }
  };
}
