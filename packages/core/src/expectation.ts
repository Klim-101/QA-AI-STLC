// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserExpectationKind } from '@qa-ai-stlc/schemas';
import { z } from 'zod';

export type ExpectationValue = string | number | boolean;

export const ElementReadingSchema = z.object({
  visible: z.boolean(),
  text: z.string(),
  value: z.string().nullable(),
  checked: z.boolean().nullable(),
  inputType: z.string().nullable(),
});
export type ElementReading = z.infer<typeof ElementReadingSchema>;

/** What one look at the page found. `element` is present only when exactly one element matched. */
export interface PageObservation {
  readonly url: string;
  readonly matchCount: number;
  readonly element?: ElementReading;
}

export interface ExpectationSpec {
  readonly kind: BrowserExpectationKind;
  readonly expected?: ExpectationValue;
  /** Text and URL are compared in full instead of by containment. */
  readonly exact: boolean;
}

export interface ExpectationVerdict {
  readonly passed: boolean;
  /** Absent when there was no single element, or no such property on it, to read. */
  readonly observed?: ExpectationValue;
}

function assertNever(value: never): never {
  throw new Error('Unhandled expectation kind: ' + JSON.stringify(value));
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function compareText(observed: string, expected: string, exact: boolean): boolean {
  const left = normalizeText(observed);
  const right = normalizeText(expected);
  return exact ? left === right : left.includes(right);
}

function describeVisibility(observation: PageObservation): string {
  if (observation.matchCount === 0) {
    return 'absent';
  }
  if (observation.matchCount > 1) {
    return 'ambiguous';
  }
  if (observation.element === undefined) {
    return 'unreadable';
  }
  return observation.element.visible ? 'visible' : 'hidden';
}

/**
 * Decides one expectation from what the page showed. Pure on purpose: the verdict is the engine's
 * and the same observation always yields the same one. Anything but exactly one matching element
 * fails an expectation that reads an element, rather than guessing which one was meant; a hidden
 * expectation also holds for an element that is absent.
 */
export function judgeExpectation(spec: ExpectationSpec, observation: PageObservation): ExpectationVerdict {
  const { element } = observation;
  switch (spec.kind) {
    case 'url':
      return {
        passed: compareText(observation.url, String(spec.expected), spec.exact),
        observed: observation.url,
      };
    case 'count':
      return { passed: observation.matchCount === spec.expected, observed: observation.matchCount };
    case 'visible':
      return {
        passed: describeVisibility(observation) === 'visible',
        observed: describeVisibility(observation),
      };
    case 'hidden': {
      const state = describeVisibility(observation);
      return { passed: state === 'hidden' || state === 'absent', observed: state };
    }
    case 'text':
      return element === undefined
        ? { passed: false }
        : { passed: compareText(element.text, String(spec.expected), spec.exact), observed: element.text };
    case 'value':
      return element?.value == null
        ? { passed: false }
        : { passed: element.value === spec.expected, observed: element.value };
    case 'checked':
      return element?.checked == null
        ? { passed: false }
        : { passed: element.checked === spec.expected, observed: element.checked };
    default:
      return assertNever(spec.kind);
  }
}
