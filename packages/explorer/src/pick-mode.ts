// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, type AuthPage, type ViewportSize } from '@qa-ai-stlc/core';
import type { InteractiveElement, LocatorCandidate, SelectorElement } from '@qa-ai-stlc/schemas';
import { createElementIdAssigner, elementNameForId } from './build-selector-registry.js';
import { createElementNamer } from './naming.js';
import { scoreLocatorStability } from './stability-scoring.js';
import { synthesizeLocatorCandidates, type LocatorPolicy } from './synthesize-locators.js';

/**
 * One element a human captured by clicking it in the overlay, before locator synthesis: the same
 * signal `extractPageElements()` reads for a crawled element (development plan section 6.1, "Manual
 * pick mode"), scoped to the same five interactive tags a crawl recognizes so a picked element
 * always resolves to a valid `InteractiveElementKind`.
 */
export interface PickModeCapture {
  readonly pickId: string;
  readonly kind: InteractiveElement['kind'];
  readonly tagName: string;
  readonly nthOfType: number;
  readonly accessibleName?: string;
  readonly testId?: string;
  readonly role?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly htmlId?: string;
}

interface PickModeState {
  readonly done: boolean;
  readonly captures: readonly PickModeCapture[];
}

/**
 * Injects the pick-mode overlay into the current page (development plan section 6.1): a fixed
 * toolbar with a "Finish picking" button, plus a capture-phase click listener that records the
 * clicked element (or its closest interactive ancestor) instead of letting the click reach the
 * application, so a click on a submit button never actually submits the form (safe mode, AGENTS.md
 * 12.4). A second call on the same page is a no-op — the overlay is idempotent across re-navigation
 * within the same pick-mode session.
 */
export async function injectPickModeOverlay(page: AuthPage): Promise<void> {
  /* v8 ignore next 95 -- runs in the browser's own V8 instance, invisible to Node coverage */
  await page.evaluate(() => {
    const globalWindow = window as unknown as { __qaPickMode?: { done: boolean; captures: unknown[] } };
    if (globalWindow.__qaPickMode !== undefined) {
      return;
    }
    const state: { done: boolean; captures: unknown[] } = { done: false, captures: [] };
    globalWindow.__qaPickMode = state;
    let nextPickId = 1;

    function accessibleName(element: Element): string | undefined {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel !== null && ariaLabel.trim().length > 0) {
        return ariaLabel;
      }
      const text = element.textContent.trim();
      return text.length > 0 ? text : undefined;
    }

    function computeRole(element: Element, kind: string): string | undefined {
      const explicit = element.getAttribute('role');
      if (explicit !== null && explicit.trim().length > 0) {
        return explicit;
      }
      if (kind === 'textarea') {
        return 'textbox';
      }
      if (kind === 'select') {
        return 'combobox';
      }
      if (kind === 'input') {
        const type = (element.getAttribute('type') ?? 'text').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
          return type;
        }
        if (type === 'button' || type === 'submit' || type === 'reset') {
          return 'button';
        }
        return 'textbox';
      }
      return kind === 'button' || kind === 'link' ? kind : undefined;
    }

    function labelText(element: Element): string | undefined {
      const id = element.getAttribute('id');
      if (id !== null && id.length > 0) {
        const associated = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const text = associated?.textContent.trim();
        if (text !== undefined && text.length > 0) {
          return text;
        }
      }
      const wrapping = element.closest('label')?.textContent.trim();
      return wrapping !== undefined && wrapping.length > 0 ? wrapping : undefined;
    }

    function nthOfType(element: Element): number {
      const parent = element.parentElement;
      if (parent === null) {
        return 1;
      }
      let index = 0;
      for (const sibling of parent.children) {
        if (sibling.tagName === element.tagName) {
          index += 1;
          if (sibling === element) {
            return index;
          }
        }
      }
      return 1;
    }

    const kindByTagName: Record<string, string> = {
      a: 'link',
      button: 'button',
      input: 'input',
      select: 'select',
      textarea: 'textarea',
    };

    const overlay = document.createElement('div');
    overlay.id = 'qa-pick-mode-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;right:0;z-index:2147483647;background:#111;color:#fff;' +
      'padding:8px 12px;font:13px sans-serif;display:flex;gap:8px;align-items:center;';
    overlay.textContent = 'QA pick mode: click an element to capture it.';

    const finishButton = document.createElement('button');
    finishButton.id = 'qa-pick-mode-finish';
    finishButton.type = 'button';
    finishButton.textContent = 'Finish picking';
    finishButton.addEventListener('click', () => {
      state.done = true;
    });
    overlay.appendChild(finishButton);
    document.body.appendChild(overlay);

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('#qa-pick-mode-overlay') !== null) {
          return;
        }
        const interactive = target.closest('button, a[href], input, select, textarea');
        if (interactive === null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        const tagName = interactive.tagName.toLowerCase();
        const kind = kindByTagName[tagName] ?? tagName;
        state.captures.push({
          pickId: `pick-${String(nextPickId)}`,
          kind,
          tagName,
          nthOfType: nthOfType(interactive),
          accessibleName: accessibleName(interactive),
          testId: interactive.getAttribute('data-testid') ?? undefined,
          role: computeRole(interactive, kind),
          label: labelText(interactive),
          placeholder: interactive.getAttribute('placeholder') ?? undefined,
          htmlId: interactive.getAttribute('id') ?? undefined,
        });
        nextPickId += 1;
      },
      { capture: true },
    );
  });
}

function isPickModeCapture(value: unknown): value is PickModeCapture {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.pickId === 'string' && typeof record.kind === 'string' && typeof record.tagName === 'string'
  );
}

function isPickModeState(value: unknown): value is PickModeState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.done === 'boolean' &&
    Array.isArray(record.captures) &&
    record.captures.every(isPickModeCapture)
  );
}

/** Reads the overlay's current state: every element captured so far, and whether the human is done. */
export async function readPickModeState(page: AuthPage): Promise<PickModeState> {
  /* v8 ignore next 3 -- runs in the browser's own V8 instance, invisible to Node coverage */
  const result = await page.evaluate(() => {
    return (window as unknown as { __qaPickMode?: PickModeState }).__qaPickMode;
  });
  return isPickModeState(result) ? result : { done: false, captures: [] };
}

export interface WaitForPickModeCompletionOptions {
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Injected so tests do not wait on real timers (AGENTS.md 5.5, 13). */
  readonly wait?: (ms: number) => Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 500;
// A human research session, not a machine operation: generous, but still bounded (AGENTS.md 5.5).
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls the overlay until the human clicks "Finish picking" (or the given `signal` cancels the
 * session), returning every element captured. Never resolves early because nothing was clicked yet:
 * an empty pick-mode session is a human decision, not a failure, so it only rejects on cancellation
 * or on exceeding `timeoutMs`.
 */
export async function waitForPickModeCompletion(
  page: AuthPage,
  options: WaitForPickModeCompletionOptions = {},
): Promise<readonly PickModeCapture[]> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wait = options.wait ?? defaultWait;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    options.signal?.throwIfAborted();
    const state = await readPickModeState(page);
    if (state.done) {
      return state.captures;
    }
    if (Date.now() >= deadline) {
      throw new QaError(
        'explorer.pick_mode.timeout',
        `Pick mode did not finish within ${String(timeoutMs)}ms`,
        { remediation: 'Click "Finish picking" in the overlay once every element has been captured.' },
      );
    }
    await wait(pollIntervalMs);
  }
}

/** One captured element with its locator candidates synthesized and its primary candidate scored. */
export interface PickModeElement {
  readonly pickId: string;
  readonly elementId: string;
  readonly kind: string;
  /** The human-meaningful text a confirmed name is derived from, before camelCasing (naming.ts). */
  readonly defaultNameText: string;
  readonly locatorCandidates: readonly LocatorCandidate[];
  readonly stabilityScore: number;
  readonly pageUrl: string;
}

export interface CapturePickModeElementsOptions {
  readonly policy?: LocatorPolicy;
  readonly viewports?: readonly ViewportSize[];
}

function toInteractiveElement(capture: PickModeCapture): InteractiveElement {
  const element: InteractiveElement = {
    kind: capture.kind,
    tagName: capture.tagName,
    nthOfType: capture.nthOfType,
  };
  if (capture.accessibleName !== undefined) {
    element.accessibleName = capture.accessibleName;
  }
  if (capture.testId !== undefined) {
    element.testId = capture.testId;
  }
  if (capture.role !== undefined) {
    element.role = capture.role;
  }
  if (capture.label !== undefined) {
    element.label = capture.label;
  }
  if (capture.placeholder !== undefined) {
    element.placeholder = capture.placeholder;
  }
  if (capture.htmlId !== undefined) {
    element.htmlId = capture.htmlId;
  }
  return element;
}

/**
 * Synthesizes locator candidates and scores the primary candidate for every element a human
 * captured, against the live page they were picked from (development plan section 6.1 step 3). The
 * `elementId` assigned here is the same one a crawl would assign the same element (build-selector-
 * registry.ts's `computeElementId`), so a page later crawled does not duplicate a manually-picked
 * entry.
 */
export async function capturePickModeElements(
  page: AuthPage,
  url: string,
  captures: readonly PickModeCapture[],
  options: CapturePickModeElementsOptions = {},
): Promise<PickModeElement[]> {
  const policy = options.policy ?? 'playwright-default';
  const elements: PickModeElement[] = [];
  const assignElementId = createElementIdAssigner();

  for (const capture of captures) {
    const interactiveElement = toInteractiveElement(capture);
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
      pickId: capture.pickId,
      elementId: assignElementId(url, interactiveElement),
      kind: interactiveElement.kind,
      defaultNameText: elementNameForId(interactiveElement),
      locatorCandidates: candidates,
      stabilityScore,
      pageUrl: url,
    });
  }

  return elements;
}

/**
 * Turns captured, scored elements into `source: 'manual'` registry entries (development plan
 * section 6.1: "the agent proposes logical names ... the human confirms"). Naming itself never
 * happens here — the engine makes no model calls (AGENTS.md non-negotiable boundary 1) — so
 * `nameOverrides` carries whatever name the human confirmed for a given `pickId`; an element with
 * no override falls back to its `defaultNameText`. Names are deduplicated across the whole batch the
 * same way a crawled registry's names are (naming.ts's `createElementNamer`).
 */
export function finalizeManualSelectorEntries(
  elements: readonly PickModeElement[],
  nameOverrides: ReadonlyMap<string, string>,
  generatedAt: string,
): SelectorElement[] {
  const nameFor = createElementNamer();
  return elements.map((element) => ({
    elementId: element.elementId,
    name: nameFor(nameOverrides.get(element.pickId) ?? element.defaultNameText, element.kind),
    kind: element.kind,
    locatorCandidates: [...element.locatorCandidates],
    stabilityScore: element.stabilityScore,
    lastVerifiedAt: generatedAt,
    source: 'manual',
    pageUrl: element.pageUrl,
  }));
}
