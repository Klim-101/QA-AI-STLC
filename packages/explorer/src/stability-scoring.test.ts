// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage, PageLocator, ViewportSize } from '@qa-ai-stlc/core';
import type { LocatorCandidate } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { resolveCandidateLocator, scoreLocatorStability } from './stability-scoring.js';
import { createLocatorMethods, type LocatorStubOptions } from './test-support/locator-stub.js';

interface LocatorCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface TrackedFakePage {
  readonly page: AuthPage;
  readonly locatorCalls: LocatorCall[];
  readonly reloadCalls: { count: number };
  readonly viewportCalls: ViewportSize[];
}

function tracked<Args extends unknown[]>(
  method: string,
  calls: LocatorCall[],
  fn: (...args: Args) => PageLocator,
): (...args: Args) => PageLocator {
  return (...args: Args) => {
    calls.push({ method, args });
    return fn(...args);
  };
}

function trackedFakePage(options: LocatorStubOptions = {}): TrackedFakePage {
  const stub = createLocatorMethods(options);
  const locatorCalls: LocatorCall[] = [];
  const reloadCalls = { count: 0 };
  const viewportCalls: ViewportSize[] = [];

  const page: AuthPage = {
    goto: () => Promise.resolve(null),
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: () => Promise.resolve(),
    evaluate: () => Promise.resolve(undefined),
    ariaSnapshotJSON: () => Promise.resolve(undefined),
    getByRole: tracked('getByRole', locatorCalls, stub.getByRole),
    getByTestId: tracked('getByTestId', locatorCalls, stub.getByTestId),
    getByLabel: tracked('getByLabel', locatorCalls, stub.getByLabel),
    getByPlaceholder: tracked('getByPlaceholder', locatorCalls, stub.getByPlaceholder),
    getByText: tracked('getByText', locatorCalls, stub.getByText),
    locator: tracked('locator', locatorCalls, stub.locator),
    reload: () => {
      reloadCalls.count += 1;
      return stub.reload();
    },
    setViewportSize: (size) => {
      viewportCalls.push(size);
      return stub.setViewportSize(size);
    },
    viewportSize: stub.viewportSize,
    url: stub.url,
    title: stub.title,
    screenshot: stub.screenshot,
  };
  return { page, locatorCalls, reloadCalls, viewportCalls };
}

const CSS_CANDIDATE: LocatorCandidate = { strategy: 'css', value: '#save', fragile: true };

describe('resolveCandidateLocator', () => {
  it('resolves each known strategy to the matching AuthPage locator method', () => {
    const { page, locatorCalls } = trackedFakePage();

    resolveCandidateLocator(page, {
      strategy: 'role',
      value: JSON.stringify({ role: 'button', name: 'Save' }),
      fragile: false,
    });
    resolveCandidateLocator(page, { strategy: 'testId', value: 'save-button', fragile: false });
    resolveCandidateLocator(page, { strategy: 'label', value: 'Save', fragile: false });
    resolveCandidateLocator(page, { strategy: 'placeholder', value: 'you@example.com', fragile: false });
    resolveCandidateLocator(page, { strategy: 'text', value: 'Save', fragile: false });
    resolveCandidateLocator(page, CSS_CANDIDATE);

    expect(locatorCalls).toEqual([
      { method: 'getByRole', args: ['button', { name: 'Save' }] },
      { method: 'getByTestId', args: ['save-button'] },
      { method: 'getByLabel', args: ['Save'] },
      { method: 'getByPlaceholder', args: ['you@example.com'] },
      { method: 'getByText', args: ['Save'] },
      { method: 'locator', args: ['#save'] },
    ]);
  });

  it('resolves a role candidate with no name to getByRole with no name option', () => {
    const { page, locatorCalls } = trackedFakePage();

    resolveCandidateLocator(page, {
      strategy: 'role',
      value: JSON.stringify({ role: 'main' }),
      fragile: false,
    });

    expect(locatorCalls).toEqual([{ method: 'getByRole', args: ['main', undefined] }]);
  });

  it('throws a QaError for a role candidate whose value is not valid JSON', () => {
    const { page } = trackedFakePage();

    expect(() =>
      resolveCandidateLocator(page, { strategy: 'role', value: 'not json', fragile: false }),
    ).toThrow('not valid JSON');
  });

  it('throws a QaError for a role candidate whose value has no role string', () => {
    const { page } = trackedFakePage();

    expect(() =>
      resolveCandidateLocator(page, {
        strategy: 'role',
        value: JSON.stringify({ name: 'Save' }),
        fragile: false,
      }),
    ).toThrow('no "role" string');
  });

  it('throws a QaError for an unknown strategy', () => {
    const { page } = trackedFakePage();

    expect(() =>
      resolveCandidateLocator(page, { strategy: 'xpath', value: '//button', fragile: false }),
    ).toThrow('Unknown locator strategy');
  });
});

describe('scoreLocatorStability', () => {
  it('scores 1 when the candidate is unique now, survives reload and every configured viewport', async () => {
    const { page, reloadCalls, viewportCalls } = trackedFakePage({ locatorCounts: [1] });

    const score = await scoreLocatorStability(page, CSS_CANDIDATE, {
      viewports: [
        { width: 1280, height: 720 },
        { width: 375, height: 667 },
      ],
    });

    expect(score).toBe(1);
    expect(reloadCalls.count).toBe(1);
    expect(viewportCalls).toEqual([
      { width: 1280, height: 720 },
      { width: 375, height: 667 },
      { width: 1280, height: 720 },
    ]);
  });

  it('scores 0 and performs no reload or viewport check when not unique now', async () => {
    const { page, reloadCalls, viewportCalls } = trackedFakePage({ locatorCounts: [0] });

    const score = await scoreLocatorStability(page, CSS_CANDIDATE);

    expect(score).toBe(0);
    expect(reloadCalls.count).toBe(0);
    expect(viewportCalls).toEqual([]);
  });

  it('scores a fraction when the candidate survives reload but not every viewport', async () => {
    const { page } = trackedFakePage({ locatorCounts: [1, 1, 1, 0] });

    const score = await scoreLocatorStability(page, CSS_CANDIDATE, {
      viewports: [
        { width: 1280, height: 720 },
        { width: 375, height: 667 },
      ],
    });

    expect(score).toBe(2 / 3);
  });

  it('does not count reload survival when the candidate is no longer unique after reload', async () => {
    const { page, reloadCalls } = trackedFakePage({ locatorCounts: [1, 0, 1] });

    const score = await scoreLocatorStability(page, CSS_CANDIDATE, {
      viewports: [{ width: 375, height: 667 }],
    });

    expect(reloadCalls.count).toBe(1);
    expect(score).toBe(1 / 2);
  });

  it('does not restore the viewport when the page reports none', async () => {
    const { page, viewportCalls } = trackedFakePage({ locatorCounts: [1], viewportSize: null });

    await scoreLocatorStability(page, CSS_CANDIDATE, { viewports: [{ width: 375, height: 667 }] });

    expect(viewportCalls).toEqual([{ width: 375, height: 667 }]);
  });

  it('uses the default desktop/tablet/mobile viewports when none are configured', async () => {
    const { page, viewportCalls } = trackedFakePage({ locatorCounts: [1] });

    const score = await scoreLocatorStability(page, CSS_CANDIDATE);

    expect(score).toBe(1);
    expect(viewportCalls).toHaveLength(4);
  });
});
