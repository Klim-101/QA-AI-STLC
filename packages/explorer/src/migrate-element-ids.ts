// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  executedElementId,
  isInEnvironment,
  legacyExecutedElementId,
  type EnvironmentScope,
} from '@qa-ai-stlc/core';
import type { SelectorElement, SelectorRegistry } from '@qa-ai-stlc/schemas';

/**
 * Gives the elements of `scope`'s environment that still carry an id with the page origin in it the
 * id they have now (ADR-0020), so a merge or a diff against what a crawl just found sees the same
 * element, with its name and history, instead of one removed and one added. A crawled or picked
 * element is recognised by `legacyElementIds` (old id to new id); an element registered from a
 * session by recomputing its old id from what it stores. An id that is already taken is left alone,
 * so a registry is never given two elements with one id.
 */
export function migrateElementIds(
  previous: SelectorRegistry,
  legacyElementIds: ReadonlyMap<string, string>,
  scope: EnvironmentScope,
): SelectorRegistry {
  const takenIds = new Set(previous.elements.map((element) => element.elementId));
  const elements = previous.elements.map((element) => {
    if (!isInEnvironment(element, scope)) {
      return element;
    }
    const target = legacyElementIds.get(element.elementId) ?? executedTarget(element, scope);
    if (target === undefined || takenIds.has(target)) {
      return element;
    }
    takenIds.add(target);
    return { ...element, elementId: target };
  });
  return { ...previous, elements };
}

function executedTarget(element: SelectorElement, scope: EnvironmentScope): string | undefined {
  const selector = element.locatorCandidates[0]?.value;
  if (element.source !== 'execute' || element.pageUrl === undefined || selector === undefined) {
    return undefined;
  }
  return legacyExecutedElementId(element.pageUrl, element.kind, selector) === element.elementId
    ? executedElementId(element.pageUrl, element.kind, selector, scope)
    : undefined;
}
