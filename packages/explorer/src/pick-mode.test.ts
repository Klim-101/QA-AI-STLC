// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import { QaError } from '@qa-ai-stlc/core';
import type { InteractiveElement } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { computeElementId } from './build-selector-registry.js';
import {
  capturePickModeElements,
  finalizeManualSelectorEntries,
  readPickModeState,
  waitForPickModeCompletion,
  type PickModeCapture,
  type PickModeElement,
} from './pick-mode.js';
import { synthesizeLocatorCandidates } from './synthesize-locators.js';
import { createLocatorMethods, type LocatorStubOptions } from './test-support/locator-stub.js';

function fakePage(overrides: Partial<AuthPage> = {}): AuthPage {
  return {
    goto: () => Promise.resolve(null),
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: () => Promise.resolve(),
    evaluate: () => Promise.resolve(undefined),
    ariaSnapshotJSON: () => Promise.resolve(undefined),
    getByRole: () => ({ count: () => Promise.resolve(1) }),
    getByTestId: () => ({ count: () => Promise.resolve(1) }),
    getByLabel: () => ({ count: () => Promise.resolve(1) }),
    getByPlaceholder: () => ({ count: () => Promise.resolve(1) }),
    getByText: () => ({ count: () => Promise.resolve(1) }),
    locator: () => ({ count: () => Promise.resolve(1) }),
    reload: () => Promise.resolve(null),
    setViewportSize: () => Promise.resolve(),
    viewportSize: () => null,
    url: () => 'about:blank',
    title: () => Promise.resolve(''),
    screenshot: () => Promise.resolve(new Uint8Array()),
    ...overrides,
  };
}

function fakeScoringPage(options: LocatorStubOptions = {}): AuthPage {
  return fakePage(createLocatorMethods(options));
}

const CAPTURE: PickModeCapture = {
  pickId: 'pick-1',
  kind: 'button',
  tagName: 'button',
  nthOfType: 1,
  accessibleName: 'Log in',
};

describe('readPickModeState', () => {
  it('parses a valid overlay state', async () => {
    const page = fakePage({
      evaluate: () => Promise.resolve({ done: true, captures: [CAPTURE] }),
    });

    await expect(readPickModeState(page)).resolves.toEqual({ done: true, captures: [CAPTURE] });
  });

  it('defaults to not-done with no captures when the overlay has not been injected', async () => {
    const page = fakePage({ evaluate: () => Promise.resolve(undefined) });

    await expect(readPickModeState(page)).resolves.toEqual({ done: false, captures: [] });
  });

  it('defaults to not-done when the evaluate result is malformed', async () => {
    const page = fakePage({ evaluate: () => Promise.resolve({ done: 'yes', captures: 'nope' }) });

    await expect(readPickModeState(page)).resolves.toEqual({ done: false, captures: [] });
  });

  it('defaults to not-done when a capture in an otherwise valid array is not an object', async () => {
    const page = fakePage({ evaluate: () => Promise.resolve({ done: true, captures: [null] }) });

    await expect(readPickModeState(page)).resolves.toEqual({ done: false, captures: [] });
  });

  it('defaults to not-done when a capture object is missing required fields', async () => {
    const page = fakePage({
      evaluate: () => Promise.resolve({ done: true, captures: [{ notAPickModeCapture: true }] }),
    });

    await expect(readPickModeState(page)).resolves.toEqual({ done: false, captures: [] });
  });
});

describe('waitForPickModeCompletion', () => {
  it('polls until the overlay reports done, returning every capture', async () => {
    const states = [
      { done: false, captures: [] },
      { done: false, captures: [CAPTURE] },
      { done: true, captures: [CAPTURE] },
    ];
    let callCount = 0;
    const page = fakePage({
      evaluate: () => Promise.resolve(states[Math.min(callCount++, states.length - 1)]),
    });
    const waits: number[] = [];

    const result = await waitForPickModeCompletion(page, {
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(result).toEqual([CAPTURE]);
    expect(waits).toEqual([500, 500]);
  });

  it('throws a QaError once the timeout elapses without a finish signal', async () => {
    const page = fakePage({ evaluate: () => Promise.resolve({ done: false, captures: [] }) });

    await expect(
      waitForPickModeCompletion(page, { timeoutMs: 0, wait: () => Promise.resolve() }),
    ).rejects.toThrow(QaError);
  });

  it('rejects immediately when the given signal is already aborted', async () => {
    const page = fakePage({ evaluate: () => Promise.resolve({ done: false, captures: [] }) });
    const controller = new AbortController();
    controller.abort();

    await expect(waitForPickModeCompletion(page, { signal: controller.signal })).rejects.toThrow();
  });

  it('waits on a real timer between polls when no wait override is given', async () => {
    const states = [
      { done: false, captures: [] },
      { done: true, captures: [CAPTURE] },
    ];
    let callCount = 0;
    const page = fakePage({
      evaluate: () => Promise.resolve(states[Math.min(callCount++, states.length - 1)]),
    });

    await expect(waitForPickModeCompletion(page, { pollIntervalMs: 1 })).resolves.toEqual([CAPTURE]);
  });
});

describe('capturePickModeElements', () => {
  it('synthesizes candidates and scores the primary candidate for each captured element', async () => {
    const page = fakeScoringPage({ locatorCounts: [1] });
    const interactiveElement: InteractiveElement = {
      kind: 'button',
      tagName: 'button',
      nthOfType: 1,
      accessibleName: 'Log in',
    };

    const [element] = await capturePickModeElements(page, 'https://example.com/login', [CAPTURE]);

    expect(element).toEqual<PickModeElement>({
      pickId: 'pick-1',
      elementId: computeElementId('https://example.com/login', interactiveElement),
      kind: 'button',
      defaultNameText: 'Log in',
      locatorCandidates: synthesizeLocatorCandidates(interactiveElement, 'playwright-default'),
      stabilityScore: 1,
      pageUrl: 'https://example.com/login',
    });
  });

  it('assigns the same elementId a crawl would assign the same element on the same page', async () => {
    const page = fakeScoringPage({ locatorCounts: [1] });

    const [element] = await capturePickModeElements(page, 'https://example.com/login', [CAPTURE]);

    expect(element?.elementId).toBe(
      computeElementId('https://example.com/login', {
        kind: 'button',
        tagName: 'button',
        nthOfType: 1,
        accessibleName: 'Log in',
      }),
    );
  });

  it('carries every optional signal (testId, label, placeholder, htmlId) into the synthesized candidates', async () => {
    const page = fakeScoringPage({ locatorCounts: [1] });
    const capture: PickModeCapture = {
      pickId: 'pick-3',
      kind: 'input',
      tagName: 'input',
      nthOfType: 2,
      testId: 'email-input',
      label: 'Email',
      placeholder: 'you@example.com',
      htmlId: 'email',
    };

    const [element] = await capturePickModeElements(page, 'https://example.com/login', [capture], {
      policy: 'testid-first',
    });

    expect(element?.locatorCandidates).toEqual(
      synthesizeLocatorCandidates(
        {
          kind: 'input',
          tagName: 'input',
          nthOfType: 2,
          testId: 'email-input',
          label: 'Email',
          placeholder: 'you@example.com',
          htmlId: 'email',
        },
        'testid-first',
      ),
    );
  });

  it('forwards a given viewports option to stability scoring', async () => {
    const page = fakeScoringPage({ locatorCounts: [1] });

    const [element] = await capturePickModeElements(page, 'https://example.com/login', [CAPTURE], {
      viewports: [{ width: 1280, height: 720 }],
    });

    expect(element?.stabilityScore).toBe(1);
  });

  it('scores 0 and still records the element when it has no locator candidate at all', async () => {
    const page = fakeScoringPage();
    const capture: PickModeCapture = { pickId: 'pick-2', kind: 'input', tagName: 'input', nthOfType: 3 };

    const [element] = await capturePickModeElements(page, 'https://example.com/form', [capture], {
      policy: 'strict-no-css',
    });

    expect(element).toEqual(
      expect.objectContaining({ pickId: 'pick-2', locatorCandidates: [], stabilityScore: 0 }),
    );
  });
});

describe('finalizeManualSelectorEntries', () => {
  function pickModeElement(overrides: Partial<PickModeElement> = {}): PickModeElement {
    return {
      pickId: 'pick-1',
      elementId: 'element-1',
      kind: 'button',
      defaultNameText: 'Log in',
      locatorCandidates: [],
      stabilityScore: 1,
      pageUrl: 'https://example.com/login',
      ...overrides,
    };
  }

  it('marks every entry source: manual with the given timestamp', () => {
    const [entry] = finalizeManualSelectorEntries([pickModeElement()], new Map(), '2026-09-18T00:00:00Z');

    expect(entry).toEqual(
      expect.objectContaining({
        elementId: 'element-1',
        source: 'manual',
        lastVerifiedAt: '2026-09-18T00:00:00Z',
        pii: false,
        dynamicText: false,
      }),
    );
  });

  it('uses the confirmed name override instead of the default name text when given', () => {
    const [entry] = finalizeManualSelectorEntries(
      [pickModeElement()],
      new Map([['pick-1', 'Submit login']]),
      '2026-09-18T00:00:00Z',
    );

    expect(entry?.name).toBe('submitLogin');
  });

  it('falls back to the default name text when no override is given', () => {
    const [entry] = finalizeManualSelectorEntries([pickModeElement()], new Map(), '2026-09-18T00:00:00Z');

    expect(entry?.name).toBe('logIn');
  });

  it('deduplicates two elements that would otherwise resolve to the same name', () => {
    const entries = finalizeManualSelectorEntries(
      [pickModeElement({ pickId: 'pick-1' }), pickModeElement({ pickId: 'pick-2', elementId: 'element-2' })],
      new Map(),
      '2026-09-18T00:00:00Z',
    );

    expect(entries.map((entry) => entry.name)).toEqual(['logIn', 'logIn2']);
  });
});
