// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION } from '@qa-ai-stlc/schemas';
import type {
  InteractiveElement,
  PageModel,
  PageModelSet,
  SelectorElement,
  SelectorRegistry,
} from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildSelectorRegistry,
  diffSelectorRegistry,
  mergeSelectorRegistry,
} from './build-selector-registry.js';
import { createFakeCrawlBrowserLauncher } from './test-support/fake-browser-launcher.js';

function element(overrides: Partial<InteractiveElement> = {}): InteractiveElement {
  return { kind: 'button', tagName: 'button', nthOfType: 1, ...overrides };
}

function pageModel(url: string, interactiveElements: readonly InteractiveElement[]): PageModel {
  return {
    url,
    accessibilityTree: { role: 'document' },
    interactiveElements: [...interactiveElements],
    forms: [],
    tables: [],
    dialogs: [],
    truncated: false,
  };
}

function pageModelSet(pages: readonly PageModel[]): PageModelSet {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-17T00:00:00Z', pages: [...pages] };
}

describe('buildSelectorRegistry', () => {
  it('assigns the same elementId across two runs against the same page model', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ accessibleName: 'Log in' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const first = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });
    const second = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(first.registry.elements[0]?.elementId).toBe(second.registry.elements[0]?.elementId);
  });

  it('assigns different elementIds to elements with different names on the same page', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([
      pageModel(url, [element({ accessibleName: 'Log in' }), element({ accessibleName: 'Cancel' })]),
    ]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]?.elementId).not.toBe(registry.elements[1]?.elementId);
  });

  it('synthesizes candidates under the given policy and scores the primary candidate', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([
      pageModel(url, [element({ testId: 'login-button', accessibleName: 'Log in' })]),
    ]);
    const browserLauncher = createFakeCrawlBrowserLauncher({ locatorCounts: [1] });

    const { registry } = await buildSelectorRegistry({
      pageModelSet: model,
      browserLauncher,
      policy: 'testid-first',
    });

    expect(registry.elements[0]?.locatorCandidates[0]).toEqual({
      strategy: 'testId',
      value: 'login-button',
      fragile: false,
    });
    expect(registry.elements[0]?.stabilityScore).toBe(1);
  });

  it('records an empty candidate list and a stability score of 0 when strict-no-css finds nothing', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element()])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({
      pageModelSet: model,
      browserLauncher,
      policy: 'strict-no-css',
    });

    expect(registry.elements[0]?.locatorCandidates).toEqual([]);
    expect(registry.elements[0]?.stabilityScore).toBe(0);
  });

  it('sets source to crawl and pii/dynamicText to false for every element', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ accessibleName: 'Log in' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]).toEqual(
      expect.objectContaining({ source: 'crawl', pii: false, dynamicText: false }),
    );
  });

  it('authenticates first and reuses the resulting session when an identity is given', async () => {
    const storageState = { cookies: [], origins: [] };
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [])]);
    const browserLauncher = createFakeCrawlBrowserLauncher({ authStorageState: storageState });

    await buildSelectorRegistry({
      pageModelSet: model,
      browserLauncher,
      identity: {
        config: { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' },
        env: {},
        cdpEndpointUrl: 'http://localhost:9222',
      },
    });

    expect(browserLauncher.newContextCalls).toEqual([{ storageState }]);
  });

  it('scores against a custom set of viewports when configured', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ accessibleName: 'Log in' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({
      pageModelSet: model,
      browserLauncher,
      viewports: [{ width: 1024, height: 768 }],
    });

    expect(registry.elements[0]?.stabilityScore).toBe(1);
  });

  it('assigns a camelCase name derived from the element accessible name', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ accessibleName: 'Log in' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]?.name).toBe('logIn');
  });

  it('deduplicates two elements that resolve to the same base name', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([
      pageModel(url, [element({ accessibleName: 'Submit' }), element({ accessibleName: 'Submit' })]),
    ]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]?.name).toBe('submit');
    expect(registry.elements[1]?.name).toBe('submit2');
  });

  it('falls back to the kind when the accessible name has no letters or digits', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ kind: 'button', accessibleName: '→' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]?.name).toBe('button');
  });

  it('prefixes a name that would start with a digit with "element"', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ accessibleName: '2fa code' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]?.name).toBe('element2faCode');
  });

  it('falls back to the element kind and never emits a reserved word as a name', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([
      pageModel(url, [element({ kind: 'link', accessibleName: 'Delete' }), element({ tagName: 'div' })]),
    ]);
    const browserLauncher = createFakeCrawlBrowserLauncher();

    const { registry } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(registry.elements[0]?.name).toBe('deleteElement');
    expect(registry.elements[1]?.name).toBe('div1');
  });

  it('counts a non-GET subrequest safe mode blocks while re-navigating to score', async () => {
    const url = 'https://staging.example.com/login';
    const model = pageModelSet([pageModel(url, [element({ accessibleName: 'Log in' })])]);
    const browserLauncher = createFakeCrawlBrowserLauncher({
      subRequestsByUrl: { [url]: [{ method: 'POST', url: 'https://staging.example.com/analytics' }] },
    });

    const { blockedRequestCount } = await buildSelectorRegistry({ pageModelSet: model, browserLauncher });

    expect(blockedRequestCount).toBe(1);
  });
});

const BASE_ELEMENT: SelectorElement = {
  elementId: 'a',
  kind: 'button',
  locatorCandidates: [{ strategy: 'testId', value: 'save', fragile: false }],
  stabilityScore: 1,
  lastVerifiedAt: '2026-09-16T00:00:00Z',
  pii: false,
  dynamicText: false,
  source: 'crawl',
};

function registry(
  elements: readonly SelectorElement[],
  generatedAt = '2026-09-16T00:00:00Z',
): SelectorRegistry {
  return { schemaVersion: SCHEMA_VERSION, generatedAt, elements: [...elements] };
}

describe('mergeSelectorRegistry', () => {
  it('replaces a previous entry with the fresh one, un-deprecating it if it had been', () => {
    const previous = registry([
      { ...BASE_ELEMENT, stabilityScore: 0.5, deprecatedAt: '2026-09-15T00:00:00Z' },
    ]);
    const fresh = registry([{ ...BASE_ELEMENT, stabilityScore: 1 }]);

    const merged = mergeSelectorRegistry(previous, fresh, '2026-09-17T00:00:00Z');

    expect(merged.elements).toEqual([{ ...BASE_ELEMENT, stabilityScore: 1 }]);
  });

  it('deprecates an element missing from the fresh crawl, stamping deprecatedAt with generatedAt', () => {
    const previous = registry([BASE_ELEMENT]);
    const fresh = registry([]);

    const merged = mergeSelectorRegistry(previous, fresh, '2026-09-17T00:00:00Z');

    expect(merged.elements).toEqual([{ ...BASE_ELEMENT, deprecatedAt: '2026-09-17T00:00:00Z' }]);
  });

  it('keeps an already-deprecated element missing on a later run without overwriting deprecatedAt', () => {
    const previous = registry([{ ...BASE_ELEMENT, deprecatedAt: '2026-09-16T00:00:00Z' }]);
    const fresh = registry([]);

    const merged = mergeSelectorRegistry(previous, fresh, '2026-09-18T00:00:00Z');

    expect(merged.elements).toEqual([{ ...BASE_ELEMENT, deprecatedAt: '2026-09-16T00:00:00Z' }]);
  });
});

describe('diffSelectorRegistry', () => {
  it('reports an element only the current crawl found as added', () => {
    const diff = diffSelectorRegistry(registry([]), registry([BASE_ELEMENT]));

    expect(diff.added).toEqual([BASE_ELEMENT]);
    expect(diff.removed).toEqual([]);
    expect(diff.degraded).toEqual([]);
  });

  it('reports an element only the previous crawl found as removed', () => {
    const diff = diffSelectorRegistry(registry([BASE_ELEMENT]), registry([]));

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([BASE_ELEMENT]);
    expect(diff.degraded).toEqual([]);
  });

  it('reports an element whose score dropped as degraded, with both scores', () => {
    const previous = registry([{ ...BASE_ELEMENT, stabilityScore: 1 }]);
    const current = registry([{ ...BASE_ELEMENT, stabilityScore: 0.5 }]);

    const diff = diffSelectorRegistry(previous, current);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.degraded).toEqual([{ elementId: 'a', previousScore: 1, currentScore: 0.5 }]);
  });

  it('does not report an unchanged or improved score as degraded', () => {
    const previous = registry([{ ...BASE_ELEMENT, stabilityScore: 0.5 }]);
    const unchanged = registry([{ ...BASE_ELEMENT, stabilityScore: 0.5 }]);
    const improved = registry([{ ...BASE_ELEMENT, stabilityScore: 1 }]);

    expect(diffSelectorRegistry(previous, unchanged).degraded).toEqual([]);
    expect(diffSelectorRegistry(previous, improved).degraded).toEqual([]);
  });
});
