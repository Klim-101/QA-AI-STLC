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
// under refactors that Playwright's role/label/testid locators survive (development plan 6.3.4).
function buildCssCandidate(element: InteractiveElement): LocatorCandidate {
  const value =
    element.htmlId !== undefined && CSS_SAFE_ID.test(element.htmlId)
      ? `#${element.htmlId}`
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
): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];
  for (const strategy of POLICY_ORDER[policy]) {
    if (strategy === 'css') {
      candidates.push(buildCssCandidate(element));
      continue;
    }
    const candidate = NON_CSS_BUILDERS[strategy](element);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  return candidates;
}
