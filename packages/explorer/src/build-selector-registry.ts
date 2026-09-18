// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { hashText, systemClock, type BrowserLauncher, type Clock, type ViewportSize } from '@qa-ai-stlc/core';
import {
  SCHEMA_VERSION,
  type InteractiveElement,
  type PageModelSet,
  type SelectorElement,
  type SelectorRegistry,
} from '@qa-ai-stlc/schemas';
import { resolveStorageState, type ExplorerIdentity } from './identity.js';
import { createSafeModeRouteHandler } from './safe-mode.js';
import { scoreLocatorStability } from './stability-scoring.js';
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
// synthesizeLocatorCandidates already uses: the id changes only when every one of those signals
// changes too, not on a DOM reorder alone. A position-based fallback is last resort, matching the
// CSS candidate's own fallback (development plan section 6.3.4).
function elementNameForId(element: InteractiveElement): string {
  return (
    element.accessibleName ??
    element.label ??
    element.testId ??
    element.placeholder ??
    `${element.tagName}:${String(element.nthOfType)}`
  );
}

function computeElementId(url: string, element: InteractiveElement): string {
  return hashText(`${url} ${element.kind} ${elementNameForId(element)}`);
}

// Splits on anything that is not a letter or digit, dropping empty segments, so accented and
// non-Latin text collapses to nothing rather than surviving as invalid identifier characters.
function wordsOf(text: string): string[] {
  return text.split(/[^A-Za-z0-9]+/u).filter((word) => word.length > 0);
}

// An accessible name equal to a reserved word ("Export", "Delete") would otherwise produce a
// locator module export that fails to compile.
const RESERVED_WORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

// `.charAt(0)` (unlike `word[0]`) always returns a plain `string` even under
// `noUncheckedIndexedAccess`, so this never needs an `undefined` fallback for an empty `word`.
function upperFirst(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

// `fallback` never needs its own empty-words guard: every caller passes an `InteractiveElement`
// `kind`, and `InteractiveElementKindSchema` is a fixed enum of real words ('button', 'link', ...),
// so `wordsOf(fallback)` is never empty even when `text` (untrusted, page-derived) is symbols only.
function toCamelCaseIdentifier(text: string, fallback: string): string {
  const words = wordsOf(text);
  const source = words.length > 0 ? words : wordsOf(fallback);
  const identifier = source
    .map((word, index) => (index === 0 ? word.toLowerCase() : upperFirst(word.toLowerCase())))
    .join('');
  if (/^[0-9]/u.test(identifier)) {
    return `element${upperFirst(identifier)}`;
  }
  return RESERVED_WORDS.has(identifier) ? `${identifier}Element` : identifier;
}

// Produces the camelCase export name an element's locator module entry will use (ADR-006). Two
// elements resolving to the same base name (e.g. two buttons both named "Submit" on different
// pages) get a numeric suffix from `seenNameCounts`, tracked across the whole registry so no two
// elements ever collide on the same export.
function nextElementName(
  interactiveElement: InteractiveElement,
  seenNameCounts: Map<string, number>,
): string {
  const base = toCamelCaseIdentifier(elementNameForId(interactiveElement), interactiveElement.kind);
  const seen = seenNameCounts.get(base) ?? 0;
  seenNameCounts.set(base, seen + 1);
  return seen === 0 ? base : `${base}${String(seen + 1)}`;
}

/**
 * Builds a `SelectorRegistry` from a `PageModelSet` produced by `analyzePages()` (development
 * plan section 6.3 steps 4-6): synthesizes locator candidates for every interactive element under
 * the configured policy, scores the first (primary) candidate's stability in a fresh live pass
 * over the same URLs, and assigns each element a stable id. Every entry's `source` is `'crawl'` -
 * the only source this pipeline produces (`static`/`manual` come from other tasks).
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
    const seenNameCounts = new Map<string, number>();

    for (const pageModel of options.pageModelSet.pages) {
      await page.goto(pageModel.url);
      for (const interactiveElement of pageModel.interactiveElements) {
        const candidates = synthesizeLocatorCandidates(interactiveElement, policy);
        const primary = candidates[0];
        const stabilityScore =
          primary === undefined
            ? 0
            : await scoreLocatorStability(
                page,
                primary,
                options.viewports === undefined ? {} : { viewports: options.viewports },
              );

        elements.push({
          elementId: computeElementId(pageModel.url, interactiveElement),
          name: nextElementName(interactiveElement, seenNameCounts),
          kind: interactiveElement.kind,
          locatorCandidates: candidates,
          stabilityScore,
          lastVerifiedAt: generatedAt,
          pii: false,
          dynamicText: false,
          source: 'crawl',
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
