// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage, PageLocator, PageResponse, ViewportSize } from '@qa-ai-stlc/core';

type LocatorMethods = Pick<
  AuthPage,
  | 'getByRole'
  | 'getByTestId'
  | 'getByLabel'
  | 'getByPlaceholder'
  | 'getByText'
  | 'locator'
  | 'reload'
  | 'setViewportSize'
  | 'viewportSize'
>;

export interface LocatorStubOptions {
  /**
   * Consumed one at a time, in order, by successive `PageLocator.count()` calls across every
   * `getBy*`/`locator()` locator this stub hands out; the last value repeats once exhausted.
   * Defaults to always resolving to exactly one match.
   */
  readonly locatorCounts?: readonly number[];
  /** Returned by `reload()`; defaults to a 200 response. */
  readonly reloadResponse?: PageResponse | null;
  /** Returned by `viewportSize()`; defaults to a 1280x720 desktop size. */
  readonly viewportSize?: ViewportSize | null;
}

const DEFAULT_RESPONSE: PageResponse = { status: () => 200 };
const DEFAULT_VIEWPORT_SIZE: ViewportSize = { width: 1280, height: 720 };

/**
 * The `getByRole`/`getByTestId`/.../`reload`/`setViewportSize` members `AuthPage` requires for
 * locator resolution (P1-09), shared so every fake page in this package's tests implements them
 * identically instead of each redefining trivial stand-ins.
 */
export function createLocatorMethods(options: LocatorStubOptions = {}): LocatorMethods {
  const counts = options.locatorCounts ?? [1];
  const reloadResponse = 'reloadResponse' in options ? options.reloadResponse : DEFAULT_RESPONSE;
  let callIndex = 0;

  function nextCount(): number {
    const value = counts[Math.min(callIndex, counts.length - 1)] ?? 1;
    callIndex += 1;
    return value;
  }

  function locator(): PageLocator {
    return { count: () => Promise.resolve(nextCount()) };
  }

  return {
    getByRole: () => locator(),
    getByTestId: () => locator(),
    getByLabel: () => locator(),
    getByPlaceholder: () => locator(),
    getByText: () => locator(),
    locator: () => locator(),
    reload: () => Promise.resolve(reloadResponse),
    setViewportSize: () => Promise.resolve(),
    viewportSize: () => ('viewportSize' in options ? (options.viewportSize ?? null) : DEFAULT_VIEWPORT_SIZE),
  };
}
