// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { InteractiveElement, LocatorCandidate } from '@qa-ai-stlc/schemas';

export const LOCATOR_POLICIES = ['playwright-default', 'testid-first', 'strict-no-css'] as const;
export type LocatorPolicy = (typeof LOCATOR_POLICIES)[number];

type NonCssStrategy = 'role' | 'testId' | 'label' | 'placeholder' | 'text';
type Strategy = NonCssStrategy | 'css';

// A CSS `id` is untrusted, page-derived text: it can contain anything, including characters that
// are not valid unescaped in a CSS identifier. Rather than escaping, an id outside this safe
// pattern falls back to the nth-of-type candidate below.
const CSS_SAFE_ID = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export interface LocatorSynthesisOptions {
  /** `config.selectors.extraStableAttributes` (P6-23): preferred, in order, over a raw id or nth-of-type. */
  readonly extraStableAttributes?: readonly string[];
  /** `config.selectors.generatedIdPatterns` (P6-23), compiled: an id matching one is never used. */
  readonly generatedIdPatterns?: readonly RegExp[];
}

function isGeneratedId(htmlId: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(htmlId));
}

// The value is untrusted, page-derived text (AGENTS.md 12.4): `"` and `\` are the only characters
// that can break out of a double-quoted CSS attribute-selector value, so escaping just those two
// keeps the candidate usable instead of silently dropping it the way an unsafe id does.
function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildRoleCandidate(element: InteractiveElement): LocatorCandidate | undefined {
  const name = element.accessibleName ?? element.label;
  if (element.role === undefined || name === undefined) {
    return undefined;
  }
  return { strategy: 'role', value: JSON.stringify({ role: element.role, name }), fragile: false };
}

function buildTestIdCandidate(element: InteractiveElement): LocatorCandidate | undefined {
  return element.testId === undefined
    ? undefined
    : { strategy: 'testId', value: element.testId, fragile: false };
}

function buildLabelCandidate(element: InteractiveElement): LocatorCandidate | undefined {
  return element.label === undefined
    ? undefined
    : { strategy: 'label', value: element.label, fragile: false };
}

function buildPlaceholderCandidate(element: InteractiveElement): LocatorCandidate | undefined {
  return element.placeholder === undefined
    ? undefined
    : { strategy: 'placeholder', value: element.placeholder, fragile: false };
}

function buildTextCandidate(element: InteractiveElement): LocatorCandidate | undefined {
  return element.accessibleName === undefined
    ? undefined
    : { strategy: 'text', value: element.accessibleName, fragile: false };
}

// The last-resort candidate: always present, always flagged fragile, since a CSS selector breaks
// under refactors that Playwright's role/label/testid locators survive (development plan 6.3.4). A
// project's own `extraStableAttributes` (P6-23) is preferred, in order, over the id/nth-of-type
// fallback below, since the project itself declared that attribute a stable signal.
function buildCssCandidate(
  element: InteractiveElement,
  options: Required<LocatorSynthesisOptions>,
): LocatorCandidate {
  for (const attribute of options.extraStableAttributes) {
    const value = element.extraAttributeValues?.[attribute];
    if (value !== undefined) {
      return { strategy: 'css', value: `[${attribute}="${escapeCssAttributeValue(value)}"]`, fragile: true };
    }
  }
  const htmlId = element.htmlId;
  const value =
    htmlId !== undefined && CSS_SAFE_ID.test(htmlId) && !isGeneratedId(htmlId, options.generatedIdPatterns)
      ? `#${htmlId}`
      : `${element.tagName}:nth-of-type(${String(element.nthOfType)})`;
  return { strategy: 'css', value, fragile: true };
}

const NON_CSS_BUILDERS: Record<
  NonCssStrategy,
  (element: InteractiveElement) => LocatorCandidate | undefined
> = {
  role: buildRoleCandidate,
  testId: buildTestIdCandidate,
  label: buildLabelCandidate,
  placeholder: buildPlaceholderCandidate,
  text: buildTextCandidate,
};

// Order follows Playwright's own guidance (development plan 6.3.4): role with an accessible name
// first, then test ID, then label/placeholder, then text, with CSS always last. `testid-first`
// swaps the first two for teams that mandate stable test IDs; `strict-no-css` drops the fragile
// fallback entirely, so an element with none of the other signals gets zero candidates.
const POLICY_ORDER: Record<LocatorPolicy, readonly Strategy[]> = {
  'playwright-default': ['role', 'testId', 'label', 'placeholder', 'text', 'css'],
  'testid-first': ['testId', 'role', 'label', 'placeholder', 'text', 'css'],
  'strict-no-css': ['role', 'testId', 'label', 'placeholder', 'text'],
};

/** Generates locator candidates for one interactive element, ordered by the given policy. */
export function synthesizeLocatorCandidates(
  element: InteractiveElement,
  policy: LocatorPolicy,
  options: LocatorSynthesisOptions = {},
): LocatorCandidate[] {
  const resolvedOptions: Required<LocatorSynthesisOptions> = {
    extraStableAttributes: options.extraStableAttributes ?? [],
    generatedIdPatterns: options.generatedIdPatterns ?? [],
  };
  const candidates: LocatorCandidate[] = [];
  for (const strategy of POLICY_ORDER[policy]) {
    if (strategy === 'css') {
      candidates.push(buildCssCandidate(element, resolvedOptions));
      continue;
    }
    const candidate = NON_CSS_BUILDERS[strategy](element);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  return candidates;
}
