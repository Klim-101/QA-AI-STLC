// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage, PageLocator, ViewportSize } from '@qa-ai-stlc/core';
import { QaError } from '@qa-ai-stlc/core';
import type { LocatorCandidate } from '@qa-ai-stlc/schemas';

export interface StabilityScoringOptions {
  /** Viewport sizes checked after uniqueness and reload survival; defaults to desktop/tablet/mobile. */
  readonly viewports?: readonly ViewportSize[];
  /**
   * Runs after every reload, before the candidates are checked again: a control that only exists
   * once a panel is open (P6-98) is not on the page a reload gives back until the panel is reopened.
   */
  readonly afterReload?: () => Promise<void>;
}

export const DEFAULT_VIEWPORTS: readonly ViewportSize[] = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
];

interface RoleCandidateValue {
  readonly role: string;
  readonly name?: string;
}

function parseRoleCandidateValue(value: string): RoleCandidateValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new QaError(
      'locator-candidate-invalid',
      `Role locator candidate value is not valid JSON: "${value}".`,
      { cause },
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).role !== 'string'
  ) {
    throw new QaError(
      'locator-candidate-invalid',
      `Role locator candidate value has no "role" string: "${value}".`,
    );
  }
  const record = parsed as Record<string, unknown>;
  return typeof record.name === 'string'
    ? { role: record.role as string, name: record.name }
    : { role: record.role as string };
}

/** Resolves one of P1-08's `LocatorCandidate` values to a live `PageLocator`, by strategy. */
export function resolveCandidateLocator(page: AuthPage, candidate: LocatorCandidate): PageLocator {
  switch (candidate.strategy) {
    case 'role': {
      const { role, name } = parseRoleCandidateValue(candidate.value);
      return page.getByRole(role, name === undefined ? undefined : { name });
    }
    case 'testId':
      return page.getByTestId(candidate.value);
    case 'label':
      return page.getByLabel(candidate.value);
    case 'placeholder':
      return page.getByPlaceholder(candidate.value);
    case 'text':
      return page.getByText(candidate.value);
    case 'css':
      return page.locator(candidate.value);
    // What the browser tool passed to `page.locator()` while the element was added from a session
    // (`role=columnheader[name="..."]`, `text=Save`, a CSS selector), so it resolves the same way.
    case 'execute':
      return page.locator(candidate.value);
    default:
      throw new QaError('locator-strategy-unknown', `Unknown locator strategy "${candidate.strategy}".`);
  }
}

async function isUniqueMatch(page: AuthPage, candidate: LocatorCandidate): Promise<boolean> {
  const count = await resolveCandidateLocator(page, candidate).count();
  return count === 1;
}

/**
 * Verifies one locator candidate against the current live page: uniqueness now, then survival
 * across a reload and across each configured viewport size (development plan section 6.3.5).
 * Uniqueness is a hard gate — a candidate that does not resolve to exactly one element right now
 * cannot be called stable, so reload/viewport are never checked against a candidate that has
 * already failed. The page's original viewport size is restored before returning, so scoring one
 * element's candidate does not affect the next.
 */
export async function scoreLocatorStability(
  page: AuthPage,
  candidate: LocatorCandidate,
  options: StabilityScoringOptions = {},
): Promise<number> {
  if (!(await isUniqueMatch(page, candidate))) {
    return 0;
  }

  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const originalViewport = page.viewportSize();
  let survivedChecks = 0;

  await page.reload();
  await options.afterReload?.();
  if (await isUniqueMatch(page, candidate)) {
    survivedChecks += 1;
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    if (await isUniqueMatch(page, candidate)) {
      survivedChecks += 1;
    }
  }

  if (originalViewport !== null) {
    await page.setViewportSize(originalViewport);
  }

  return survivedChecks / (1 + viewports.length);
}

export interface CandidateStabilityScore {
  readonly candidate: LocatorCandidate;
  readonly stabilityScore: number;
}

export interface PageScoringItem {
  readonly candidates: readonly LocatorCandidate[];
}

interface CandidateProgress {
  readonly candidate: LocatorCandidate;
  uniqueNow: boolean;
  survivedChecks: number;
}

// Each count is a round trip to the browser, and a page scores every candidate of every element
// five times over (now, after a reload, once per viewport), so awaiting them one by one made the
// round trips the whole cost of exploring a page (P6-120). A small bound keeps them pipelined
// without flooding the browser's connection.
const COUNT_CONCURRENCY = 16;

async function areUniqueMatches(page: AuthPage, candidates: readonly LocatorCandidate[]): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let start = 0; start < candidates.length; start += COUNT_CONCURRENCY) {
    const batch = candidates.slice(start, start + COUNT_CONCURRENCY);
    results.push(...(await Promise.all(batch.map((candidate) => isUniqueMatch(page, candidate)))));
  }
  return results;
}

async function checkSurvival(
  page: AuthPage,
  groups: readonly { readonly progress: readonly CandidateProgress[] }[],
): Promise<void> {
  const states = groups.flatMap((group) => group.progress).filter((state) => state.uniqueNow);
  const survived = await areUniqueMatches(
    page,
    states.map((state) => state.candidate),
  );
  states.forEach((state, index) => {
    if (survived[index] === true) {
      state.survivedChecks += 1;
    }
  });
}

/**
 * Batches `scoreLocatorStability`'s three checks (unique now, survives one shared reload,
 * survives each shared viewport resize) across every candidate of every element on the current
 * live page, instead of reloading and resizing once per element (#283: a 200-element page
 * previously meant 200 reloads to score one page). Scores every synthesized candidate, not only
 * the policy-picked primary, so a caller can promote whichever candidate actually proved most
 * stable rather than trusting policy order alone.
 */
export async function scorePageCandidates<T extends PageScoringItem>(
  page: AuthPage,
  items: readonly T[],
  options: StabilityScoringOptions = {},
): Promise<(T & { readonly scoredCandidates: readonly CandidateStabilityScore[] })[]> {
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const originalViewport = page.viewportSize();

  const uniqueNow = await areUniqueMatches(
    page,
    items.flatMap((item) => item.candidates),
  );
  let candidateIndex = 0;
  const groups: { readonly item: T; readonly progress: CandidateProgress[] }[] = items.map((item) => ({
    item,
    progress: item.candidates.map((candidate) => {
      const state: CandidateProgress = {
        candidate,
        uniqueNow: uniqueNow[candidateIndex] === true,
        survivedChecks: 0,
      };
      candidateIndex += 1;
      return state;
    }),
  }));

  await page.reload();
  await options.afterReload?.();
  await checkSurvival(page, groups);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await checkSurvival(page, groups);
  }

  if (originalViewport !== null) {
    await page.setViewportSize(originalViewport);
  }

  return groups.map(({ item, progress }) => ({
    ...item,
    scoredCandidates: progress.map((state) => ({
      candidate: state.candidate,
      stabilityScore: state.uniqueNow ? state.survivedChecks / (1 + viewports.length) : 0,
    })),
  }));
}
