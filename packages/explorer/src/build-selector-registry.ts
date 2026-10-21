// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  hashText,
  pageKeyInEnvironment,
  partitionByEnvironment,
  systemClock,
  withEnvironment,
  type AuthPage,
  type BrowserLauncher,
  type Clock,
  type EnvironmentScope,
  type ViewportSize,
} from '@qa-ai-stlc/core';
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
import { revealCollapsedPanels } from './reveal-collapsed-panels.js';
import { assertNotSignedOut } from './sign-in-redirect.js';
import { createSafeModeRouteHandler, type SafeModeRequests } from './safe-mode.js';
import { settlePage, type PageSettleOptions } from './settle-page.js';
import { scorePageCandidates, type CandidateStabilityScore } from './stability-scoring.js';
import { mergeGeneratedIdPatterns, type ComponentLibraryProfile } from './component-library-profile.js';
import { synthesizeLocatorCandidates, type LocatorPolicy } from './synthesize-locators.js';

export interface BuildSelectorRegistryOptions {
  readonly pageModelSet: PageModelSet;
  /** Hostnames safe mode may navigate to while re-scoring candidates (#306). */
  readonly allowlist: readonly string[];
  /** The environment's configured URL; an allowed request must also share its scheme and port. */
  readonly baseUrl: string;
  /** The environment's name; element ids are made from it and the page path (ADR-0020). */
  readonly environmentName: string;
  readonly browserLauncher: BrowserLauncher;
  /** Signs in before re-navigating to score candidates. Omit to score anonymously. */
  readonly identity?: ExplorerIdentity;
  readonly policy?: LocatorPolicy;
  readonly viewports?: readonly ViewportSize[];
  /** `config.selectors.extraStableAttributes` (P6-23). */
  readonly extraStableAttributes?: readonly string[];
  /** `config.selectors.generatedIdPatterns` (P6-23), as regular-expression source text. */
  readonly generatedIdPatterns?: readonly string[];
  /** Profile of `ui.componentLibrary` (P6-37): contributes generated-id patterns and names widgets' library. */
  readonly profile?: ComponentLibraryProfile;
  readonly clock?: Clock;
  /** Bypasses TLS certificate validation for this scoring session (P2-18); off by default. */
  readonly tlsInsecure?: boolean;
  /** The environment's `safeNonGetRequests` and where to tally what safe mode did (ADR-0014). */
  readonly safeMode?: SafeModeRequests;
  /** What to wait for after each navigation before the page is read (P6-63). */
  readonly settle?: PageSettleOptions;
  /**
   * Opens each page's collapsed panels before scoring, and again after every reload the scoring
   * makes, so the controls inside them resolve (P6-98). Each page is then scored in a context of its own.
   */
  readonly revealCollapsed?: boolean;
}

export interface BuildSelectorRegistryResult {
  readonly registry: SelectorRegistry;
  /** Every non-GET request safe mode intercepted and cancelled; always 0 unless something is broken. */
  readonly blockedRequestCount: number;
  /** Each id the elements had before ids left out the origin, mapped to the id they have now (`migrateElementIds`). */
  readonly legacyElementIds: ReadonlyMap<string, string>;
}

// A bare number or a lone letter plus digits ("V11102") makes a function name nobody can tell from
// its neighbours, so the next signal is tried instead. Text with no digits is left to the naming
// step, which already falls back to the element kind.
function isMeaningfulName(text: string | undefined): text is string {
  return text !== undefined && !(/\d/u.test(text) && (text.match(/\p{L}/gu) ?? []).length < 2);
}

// The element's best available human-meaningful name, in the same signal-quality order
// synthesizeLocatorCandidates already uses: chosen for how well it reads as an identifier, not
// for how stable it is across crawls. Exported for pick mode (P1-14), which uses it as the
// default text a human can rename before it becomes a locator module export.
export function elementNameForId(element: InteractiveElement): string {
  return (
    [element.accessibleName, element.label, element.testId, element.placeholder].find(isMeaningfulName) ??
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
 * A stable id for `element` as found on the page `pageKey` names (`pageKeyInEnvironment`).
 * `occurrenceIndex` disambiguates two elements that resolve to the same identity signal on the same
 * page (#282, e.g. two "Delete" buttons in a list): pass the number of elements with the same
 * `(page, kind, signal)` already assigned an id before this one, 0 for the first.
 * `createElementIdAssigner()` tracks this automatically across a batch of elements; call this
 * directly only to recompute a specific element's id in isolation.
 */
export function computeElementId(pageKey: string, element: InteractiveElement, occurrenceIndex = 0): string {
  const disambiguator = occurrenceIndex === 0 ? '' : ` #${String(occurrenceIndex)}`;
  return hashText(`${pageKey} ${element.kind} ${elementIdentitySignal(element)}${disambiguator}`);
}

function createAssigner(
  pageKeyOf: (url: string) => string,
): (url: string, element: InteractiveElement) => string {
  const seenCounts = new Map<string, number>();
  return (url, element) => {
    const pageKey = pageKeyOf(url);
    const key = `${pageKey}\u0000${element.kind}\u0000${elementIdentitySignal(element)}`;
    const occurrenceIndex = seenCounts.get(key) ?? 0;
    seenCounts.set(key, occurrenceIndex + 1);
    return computeElementId(pageKey, element, occurrenceIndex);
  };
}

/**
 * Assigns every element from one crawl or pick-mode capture batch a stable id via
 * `computeElementId`, tracking how many elements sharing the same `(page, kind, signal)` were
 * already assigned one so duplicates (#282, e.g. two same-named buttons on one page) never
 * collide. The page is named by environment and path, not by origin (ADR-0020), so the same
 * environment served on another port keeps its ids. Without a `scope` the whole address is used.
 * Create one instance per batch; instances never share state.
 */
export function createElementIdAssigner(
  scope?: EnvironmentScope,
): (url: string, element: InteractiveElement) => string {
  return createAssigner((url) => (scope === undefined ? url : pageKeyInEnvironment(url, scope)));
}

/**
 * Assigns the ids a batch had before they left out the origin, so a registry written then can be
 * recognised and migrated (`migrateElementIds`). Call it for the same elements, in the same order,
 * as `createElementIdAssigner()`.
 */
export function createLegacyElementIdAssigner(): (url: string, element: InteractiveElement) => string {
  return createAssigner((url) => url);
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
  const extraStableAttributes = options.extraStableAttributes ?? [];
  const generatedIdPatterns = mergeGeneratedIdPatterns(
    options.generatedIdPatterns ?? [],
    options.profile,
  ).map((source) => new RegExp(source));
  let sessionState = await resolveStorageState(
    options.browserLauncher,
    options.identity,
    { allowlist: options.allowlist, baseUrl: options.baseUrl },
    options.tlsInsecure,
  );

  const browser = await options.browserLauncher.launch();
  try {
    let blockedRequestCount = 0;
    // Safe mode is installed on the context, not the page, so a popup a click opens is covered too.
    const openSession = async (): Promise<{
      page: AuthPage;
      rememberState: () => Promise<void>;
      close: () => Promise<void>;
    }> => {
      const context = await browser.newContext({
        ...(sessionState === undefined ? {} : { storageState: sessionState }),
        ...(options.tlsInsecure === true ? { ignoreHttpsErrors: true } : {}),
      });
      await context.route(
        '**/*',
        createSafeModeRouteHandler(
          options.allowlist,
          options.baseUrl,
          () => {
            blockedRequestCount += 1;
          },
          options.safeMode,
        ),
      );
      return {
        page: await context.newPage(),
        // An application that rotates its session token on use hands the next context a dead one
        // unless the state its page loaded with is carried forward. It is taken after every load
        // and before any panel is opened, so nothing a click changed outlives the discarded context
        // (ADR-0015).
        rememberState: async () => {
          sessionState = await context.storageState();
        },
        close: () => context.close(),
      };
    };
    const revealCollapsed = options.revealCollapsed === true;
    const sharedSession = revealCollapsed ? undefined : await openSession();

    const generatedAt = clock.now().toISOString();
    const elements: SelectorElement[] = [];
    const nameFor = createElementNamer();
    const assignElementId = createElementIdAssigner({
      name: options.environmentName,
      baseUrl: options.baseUrl,
      allowlist: options.allowlist,
    });
    const assignLegacyElementId = createLegacyElementIdAssigner();
    const legacyElementIds = new Map<string, string>();

    for (const pageModel of options.pageModelSet.pages) {
      const session = sharedSession ?? (await openSession());
      try {
        const { page } = session;
        await page.goto(pageModel.url);
        await settlePage(page, pageModel.url, options.settle);
        const reveal = async (): Promise<void> => {
          if (revealCollapsed) {
            assertNotSignedOut(page, pageModel.url, options.identity);
            await session.rememberState();
            await revealCollapsedPanels(page, {
              pageUrl: pageModel.url,
              ...(options.profile?.collapsiblePanelSelectors === undefined
                ? {}
                : { extraSelectors: options.profile.collapsiblePanelSelectors }),
              ...(options.settle === undefined ? {} : { settle: options.settle }),
            });
          }
        };
        await reveal();

        const scored = await scorePageCandidates(
          page,
          pageModel.interactiveElements.map((interactiveElement) => ({
            interactiveElement,
            candidates: synthesizeLocatorCandidates(interactiveElement, policy, {
              extraStableAttributes,
              generatedIdPatterns,
            }),
          })),
          {
            ...(options.viewports === undefined ? {} : { viewports: options.viewports }),
            afterReload: reveal,
          },
        );

        for (const { interactiveElement, scoredCandidates } of scored) {
          const { primaryCandidates, stabilityScore } = selectPrimaryCandidate(scoredCandidates);

          const kind = interactiveElement.widgetKind ?? interactiveElement.kind;
          const elementId = assignElementId(pageModel.url, interactiveElement);
          legacyElementIds.set(assignLegacyElementId(pageModel.url, interactiveElement), elementId);
          elements.push({
            elementId,
            name: nameFor(elementNameForId(interactiveElement), kind),
            kind,
            ...(interactiveElement.widgetKind !== undefined && options.profile !== undefined
              ? { library: options.profile.id }
              : {}),
            ...(interactiveElement.popupId === undefined ? {} : { popupId: interactiveElement.popupId }),
            locatorCandidates: primaryCandidates,
            stabilityScore,
            lastVerifiedAt: generatedAt,
            source: 'crawl',
            pageUrl: pageModel.url,
          });
        }
      } finally {
        if (sharedSession === undefined) {
          await session.close();
        }
      }
    }

    const registry: SelectorRegistry = { schemaVersion: SCHEMA_VERSION, generatedAt, elements };
    return { registry, blockedRequestCount, legacyElementIds };
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
 * An `execute`-sourced element is the exception: it was added from a live session precisely because
 * the crawl cannot see it (a collapsed panel, a non-interactive header), so a crawl that misses it
 * says nothing about whether it is gone and it stays as it was.
 *
 * With a `scope` (ADR-0020), only the previous elements of that environment take part: an element of
 * another environment is neither replaced, deprecated nor renamed, because a crawl of one
 * environment says nothing about what another has. The elements the crawl found are recorded as
 * the scope's, and no name of an element left alone is given to one of them, so the single locator
 * module never gets two functions with one name.
 */
export function mergeSelectorRegistry(
  previous: SelectorRegistry,
  fresh: SelectorRegistry,
  generatedAt: string,
  scope?: EnvironmentScope,
): SelectorRegistry {
  const { inScope, outOfScope } =
    scope === undefined
      ? { inScope: previous.elements, outOfScope: [] }
      : partitionByEnvironment(previous.elements, scope);
  const record = (element: SelectorElement): SelectorElement =>
    scope === undefined ? element : withEnvironment(element, scope);
  const freshElements = fresh.elements.map(record);

  const freshIds = new Set(freshElements.map((element) => element.elementId));
  const deprecated = inScope
    .filter((element) => !freshIds.has(element.elementId) && element.source !== 'execute')
    .map((element) =>
      record(element.deprecatedAt === undefined ? { ...element, deprecatedAt: generatedAt } : element),
    );

  const sessionAdded = inScope
    .filter((element) => !freshIds.has(element.elementId) && element.source === 'execute')
    .map(record);

  const reservedNames = new Set(
    outOfScope.flatMap((element) => (element.name === undefined ? [] : [element.name])),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    elements: [
      ...keepPreviousNames(inScope, freshElements, reservedNames),
      ...sessionAdded,
      ...deprecated,
      ...outOfScope,
    ],
  };
}

// A spec already imports an element by its generated function name, so an element that is still
// found keeps the name it had. Names are settled in two passes: elements with a previous name take
// it first (the first holder wins), then every other element keeps its fresh name, numbered past
// any name already taken so two elements never end up with the same one. `reservedNames` are names
// of elements this merge leaves alone; they count as taken from the start.
function keepPreviousNames(
  previousElements: readonly SelectorElement[],
  freshElements: readonly SelectorElement[],
  reservedNames: ReadonlySet<string>,
): SelectorElement[] {
  const previousNames = new Map(
    previousElements.flatMap((element) =>
      element.name === undefined ? [] : [[element.elementId, element.name] as const],
    ),
  );
  const takenNames = new Set<string>(reservedNames);
  const pinnedNames = new Map<string, string>();
  for (const element of freshElements) {
    const previousName = previousNames.get(element.elementId);
    if (previousName !== undefined && !takenNames.has(previousName)) {
      takenNames.add(previousName);
      pinnedNames.set(element.elementId, previousName);
    }
  }
  return freshElements.map((element) => {
    const pinnedName = pinnedNames.get(element.elementId);
    if (pinnedName !== undefined) {
      return { ...element, name: pinnedName };
    }
    if (element.name === undefined) {
      return element;
    }
    let name = element.name;
    for (let suffix = 2; takenNames.has(name); suffix += 1) {
      name = `${element.name}${String(suffix)}`;
    }
    takenNames.add(name);
    return name === element.name ? element : { ...element, name };
  });
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
 * lower than before. An element added from a session is never "removed" by a crawl that misses it
 * (see `mergeSelectorRegistry`). With a `scope`, only the previous elements of that environment are
 * compared: one of another environment is not "removed" by a crawl that never looked at it.
 */
export function diffSelectorRegistry(
  previous: SelectorRegistry,
  current: SelectorRegistry,
  scope?: EnvironmentScope,
): SelectorRegistryDiff {
  const previousElements =
    scope === undefined ? previous.elements : partitionByEnvironment(previous.elements, scope).inScope;
  const previousById = new Map(previousElements.map((element) => [element.elementId, element]));
  const currentIds = new Set(current.elements.map((element) => element.elementId));

  const added = current.elements.filter((element) => !previousById.has(element.elementId));
  const removed = previousElements.filter(
    (element) => !currentIds.has(element.elementId) && element.source !== 'execute',
  );

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
