// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { hashText, systemClock, type BrowserLauncher, type Clock, type ViewportSize } from '@qa-ai-stlc/core';
import {
  SCHEMA_VERSION,
  type InteractiveElement,
  type LocatorCandidate,
  type PageModelSet,
  type SelectorElement,
  type SelectorRegistry,
} from '@qa-ai-stlc/schemas';
import { resolveStorageState, type ExplorerIdentity } from './identity.js';
import { createElementNamer } from './naming.js';
import { createSafeModeRouteHandler } from './safe-mode.js';
import { scorePageCandidates, type CandidateStabilityScore } from './stability-scoring.js';
import { synthesizeLocatorCandidates, type LocatorPolicy } from './synthesize-locators.js';

export interface BuildSelectorRegistryOptions {
  readonly pageModelSet: PageModelSet;
  readonly browserLauncher: BrowserLauncher;
  /** Signs in before re-navigating to score candidates. Omit to score anonymously. */
  readonly identity?: ExplorerIdentity;
  readonly policy?: LocatorPolicy;
  readonly viewports?: readonly ViewportSize[];
  readonly clock?: Clock;
}

export interface BuildSelectorRegistryResult {
  readonly registry: SelectorRegistry;
  /** Every non-GET request safe mode intercepted and cancelled; always 0 unless something is broken. */
  readonly blockedRequestCount: number;
}

// The element's best available human-meaningful name, in the same signal-quality order
// synthesizeLocatorCandidates already uses: chosen for how well it reads as an identifier, not
// for how stable it is across crawls. Exported for pick mode (P1-14), which uses it as the
// default text a human can rename before it becomes a locator module export.
export function elementNameForId(element: InteractiveElement): string {
  return (
    element.accessibleName ??
    element.label ??
    element.testId ??
    element.placeholder ??
    `${element.tagName}:${String(element.nthOfType)}`
  );
}

// The signal `computeElementId` hashes, in stability order rather than `elementNameForId`'s
// locator-quality order (#282): `testId` ranks first because it is the one signal actually
// designed to stay constant across crawls, unlike `accessibleName`/`label`, which legitimately
// change with live page content (a "Cart (3)" button's accessible name changes the moment the
// badge count does).
function elementIdentitySignal(element: InteractiveElement): string {
  return (
    element.testId ??
    element.accessibleName ??
    element.label ??
    element.placeholder ??
    `${element.tagName}:${String(element.nthOfType)}`
  );
}

/**
 * A stable id for `element` as found on `url`. `occurrenceIndex` disambiguates two elements that
 * resolve to the same identity signal on the same page (#282, e.g. two "Delete" buttons in a
 * list): pass the number of elements with the same `(url, kind, signal)` already assigned an id
 * before this one, 0 for the first. `createElementIdAssigner()` tracks this automatically across
 * a batch of elements; call this directly only to recompute a specific element's id in isolation.
 */
export function computeElementId(url: string, element: InteractiveElement, occurrenceIndex = 0): string {
  const disambiguator = occurrenceIndex === 0 ? '' : ` #${String(occurrenceIndex)}`;
  return hashText(`${url} ${element.kind} ${elementIdentitySignal(element)}${disambiguator}`);
}

/**
 * Assigns every element from one crawl or pick-mode capture batch a stable id via
 * `computeElementId`, tracking how many elements sharing the same `(url, kind, signal)` were
 * already assigned one so duplicates (#282, e.g. two same-named buttons on one page) never
 * collide. Create one instance per batch; instances never share state.
 */
export function createElementIdAssigner(): (url: string, element: InteractiveElement) => string {
  const seenCounts = new Map<string, number>();
  return (url, element) => {
    const key = `${url}\u0000${element.kind}\u0000${elementIdentitySignal(element)}`;
    const occurrenceIndex = seenCounts.get(key) ?? 0;
    seenCounts.set(key, occurrenceIndex + 1);
    return computeElementId(url, element, occurrenceIndex);
  };
}

// Promotes whichever synthesized candidate actually scored highest to primary (`locatorCandidates[0]`,
// what `generate-locator-module.ts` uses unconditionally) instead of trusting policy order alone
// (#283): a lower-priority candidate that survives reload/viewport checks better than the
// policy-picked one is otherwise never surfaced. A tie keeps the first candidate to reach the top
// score, which is the earliest one in policy order among the tied candidates.
function selectPrimaryCandidate(scoredCandidates: readonly CandidateStabilityScore[]): {
  primaryCandidates: LocatorCandidate[];
  stabilityScore: number;
} {
  let winner: CandidateStabilityScore | undefined;
  for (const scored of scoredCandidates) {
    if (winner === undefined || scored.stabilityScore > winner.stabilityScore) {
      winner = scored;
    }
  }
  if (winner === undefined) {
    return { primaryCandidates: [], stabilityScore: 0 };
  }
  const rest = scoredCandidates
    .filter((scored) => scored.candidate !== winner.candidate)
    .map((scored) => scored.candidate);
  return { primaryCandidates: [winner.candidate, ...rest], stabilityScore: winner.stabilityScore };
}

/**
 * Builds a `SelectorRegistry` from a `PageModelSet` produced by `analyzePages()` (development
 * plan section 6.3 steps 4-6): synthesizes locator candidates for every interactive element under
 * the configured policy, scores every candidate's stability in one batched live pass over the
 * same URLs (`scorePageCandidates`, #283) and promotes whichever one scored highest to primary,
 * and assigns each element a stable id. Every entry's `source` is `'crawl'` - the only source this
 * pipeline produces (`static`/`manual` come from other tasks).
 */
export async function buildSelectorRegistry(
  options: BuildSelectorRegistryOptions,
): Promise<BuildSelectorRegistryResult> {
  const clock = options.clock ?? systemClock;
  const policy = options.policy ?? 'playwright-default';
  const storageState = await resolveStorageState(options.browserLauncher, options.identity);

  const browser = await options.browserLauncher.launch();
  try {
    const context = await browser.newContext(storageState === undefined ? {} : { storageState });
    const page = await context.newPage();
    let blockedRequestCount = 0;
    await page.route(
      '**/*',
      createSafeModeRouteHandler(() => {
        blockedRequestCount += 1;
      }),
    );

    const generatedAt = clock.now().toISOString();
    const elements: SelectorElement[] = [];
    const nameFor = createElementNamer();
    const assignElementId = createElementIdAssigner();

    for (const pageModel of options.pageModelSet.pages) {
      await page.goto(pageModel.url);

      const scored = await scorePageCandidates(
        page,
        pageModel.interactiveElements.map((interactiveElement) => ({
          interactiveElement,
          candidates: synthesizeLocatorCandidates(interactiveElement, policy),
        })),
        options.viewports === undefined ? {} : { viewports: options.viewports },
      );

      for (const { interactiveElement, scoredCandidates } of scored) {
        const { primaryCandidates, stabilityScore } = selectPrimaryCandidate(scoredCandidates);

        elements.push({
          elementId: assignElementId(pageModel.url, interactiveElement),
          name: nameFor(elementNameForId(interactiveElement), interactiveElement.kind),
          kind: interactiveElement.kind,
          locatorCandidates: primaryCandidates,
          stabilityScore,
          lastVerifiedAt: generatedAt,
          pii: false,
          dynamicText: false,
          source: 'crawl',
          pageUrl: pageModel.url,
        });
      }
    }

    const registry: SelectorRegistry = { schemaVersion: SCHEMA_VERSION, generatedAt, elements };
    return { registry, blockedRequestCount };
  } finally {
    await browser.close();
  }
}

/**
 * Merges a freshly built registry onto a previously stored one, keeping history (development plan
 * section 6.3.6): every element the fresh crawl found replaces its previous entry outright
 * (un-deprecating it, if it had been). An element the fresh crawl did not find is kept rather than
 * deleted, with `deprecatedAt` set to `generatedAt` the first time it goes missing; once
 * deprecated, its `deprecatedAt` is never overwritten by a later run that still does not find it.
 */
export function mergeSelectorRegistry(
  previous: SelectorRegistry,
  fresh: SelectorRegistry,
  generatedAt: string,
): SelectorRegistry {
  const freshIds = new Set(fresh.elements.map((element) => element.elementId));
  const deprecated = previous.elements
    .filter((element) => !freshIds.has(element.elementId))
    .map((element) =>
      element.deprecatedAt === undefined ? { ...element, deprecatedAt: generatedAt } : element,
    );

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    elements: [...fresh.elements, ...deprecated],
  };
}

export interface DegradedSelectorElement {
  readonly elementId: string;
  readonly previousScore: number;
  readonly currentScore: number;
}

export interface SelectorRegistryDiff {
  readonly added: readonly SelectorElement[];
  readonly removed: readonly SelectorElement[];
  readonly degraded: readonly DegradedSelectorElement[];
}

/**
 * Compares two crawls' registries by `elementId`: elements only the current crawl found, elements
 * only the previous crawl found, and elements both found where the current stability score is
 * lower than before.
 */
export function diffSelectorRegistry(
  previous: SelectorRegistry,
  current: SelectorRegistry,
): SelectorRegistryDiff {
  const previousById = new Map(previous.elements.map((element) => [element.elementId, element]));
  const currentIds = new Set(current.elements.map((element) => element.elementId));

  const added = current.elements.filter((element) => !previousById.has(element.elementId));
  const removed = previous.elements.filter((element) => !currentIds.has(element.elementId));

  const degraded: DegradedSelectorElement[] = [];
  for (const element of current.elements) {
    const before = previousById.get(element.elementId);
    if (before !== undefined && element.stabilityScore < before.stabilityScore) {
      degraded.push({
        elementId: element.elementId,
        previousScore: before.stabilityScore,
        currentScore: element.stabilityScore,
      });
    }
  }

  return { added, removed, degraded };
}
