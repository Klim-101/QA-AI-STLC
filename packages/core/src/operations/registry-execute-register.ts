// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  SelectorRegistrySchema,
  type RelativePath,
  type SelectorElement,
} from '@qa-ai-stlc/schemas';
import type { BrowserOperationContext } from './browser-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';

const REGISTRY_PATH: RelativePath = 'selectors/registry.json';

export interface RegisterExecutedElementOptions {
  readonly sessionId: string;
  /**
   * A Playwright selector for an element interactive execution is using, or has just used, via
   * `qa.browser_click`/`qa.browser_fill`. Call this before an action that navigates away (a form
   * submit, a link) — this operation re-verifies the selector against the session's *current*
   * page, which no longer has the element once its own action has navigated past it.
   */
  readonly selector: string;
  readonly kind: string;
  readonly name?: string;
}

export interface RegisterExecutedElementResult {
  readonly elementId: string;
  /** `false` when this selector was already registered as `execute`-sourced and only re-verified. */
  readonly created: boolean;
}

/**
 * Promotes an ad hoc, registry-less element pick into `.qa/selectors/registry.json` as
 * `source: 'execute'` (P3-14), once interactive execution has actually used it. Re-verifies the
 * selector resolves to exactly one element on the session's current page itself rather than
 * trusting an earlier click/fill's success (AGENTS.md 12.7 point 1) — a selector that stopped
 * being unique, or whose own action navigated the page away from it, must not be recorded as a
 * stable locator.
 *
 * `elementId` is computed independently of `packages/explorer`'s crawl-sourced formula, which
 * `packages/core` cannot import (AGENTS.md 3: `core` and `explorer` are dependency siblings). An
 * `execute`-sourced element may therefore get a different id than a later crawl assigns to the
 * same real DOM element — a known v0 limitation, not required by this capability's exit criteria.
 */
export async function runRegisterExecutedElement(
  context: BrowserOperationContext,
  options: RegisterExecutedElementOptions,
): Promise<RegisterExecutedElementResult> {
  const session = await context.sessions.get(options.sessionId);
  const count = await session.page.locator(options.selector).count();
  if (count !== 1) {
    throw new QaError(
      'EXECUTE_SELECTOR_NOT_UNIQUE',
      `Selector "${options.selector}" resolves to ${String(count)} element(s), not exactly 1`,
      { remediation: 'Use a selector that uniquely identifies the element on the current page.' },
    );
  }

  const url = session.page.url();
  const elementId = hashText(`${url} ${options.kind} ${options.selector}`);
  const now = context.engine.clock.now().toISOString();
  const element: SelectorElement = {
    elementId,
    kind: options.kind,
    ...(options.name !== undefined ? { name: options.name } : {}),
    locatorCandidates: [{ strategy: 'execute', value: options.selector, fragile: true }],
    stabilityScore: 1,
    lastVerifiedAt: now,
    source: 'execute',
    pageUrl: url,
  };

  const store = new QaStore({ projectRoot: context.engine.projectRoot, fs: context.engine.fs });
  const manifest = new ManifestStore({ store, clock: context.engine.clock });
  const exists = await store.pathExists(REGISTRY_PATH);
  const registry = exists
    ? await store.readJson(REGISTRY_PATH, SelectorRegistrySchema)
    : { schemaVersion: SCHEMA_VERSION, generatedAt: now, elements: [] };

  const index = registry.elements.findIndex((candidate) => candidate.elementId === elementId);
  const elements =
    index === -1
      ? [...registry.elements, element]
      : registry.elements.map((candidate, i) => (i === index ? element : candidate));
  const updated = { ...registry, generatedAt: now, elements };
  const serialized = toCanonicalJson(updated);
  await store.writeJson(REGISTRY_PATH, updated);
  await manifest.register(REGISTRY_PATH, serialized);

  return { elementId, created: index === -1 };
}
