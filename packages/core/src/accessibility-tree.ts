// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AccessibilityNode } from '@qa-ai-stlc/schemas';
import { DEFAULT_NORMALIZE_LIMITS, truncateText, type NormalizeLimits } from './normalize.js';

const FALLBACK_ROLE = 'generic';
const TEXT_ROLE = 'text';
const ROOT_ROLE = 'root';
const BOOLEAN_FLAGS = ['checked', 'disabled', 'expanded', 'pressed', 'selected'] as const;

export interface NormalizedAccessibilityTree {
  readonly tree: AccessibilityNode;
  readonly truncated: boolean;
}

/**
 * Turns the free-form JSON `AuthPage.ariaSnapshotJSON()` returns into a capped
 * `AccessibilityNode` tree. The input is untrusted, page-derived data (development plan section
 * 2.6): every field is read defensively, string fields are length-capped, and the total node
 * count is capped so one page can never grow the artifact — or an agent's context — unbounded.
 */
export function normalizeAccessibilityTree(
  raw: unknown,
  limits: NormalizeLimits = DEFAULT_NORMALIZE_LIMITS,
): NormalizedAccessibilityTree {
  let nodeCount = 0;
  let truncated = false;

  function normalizeText(text: string): string {
    const result = truncateText(text, limits);
    if (result.truncated) {
      truncated = true;
    }
    return result.text;
  }

  function visit(node: unknown): AccessibilityNode | undefined {
    nodeCount += 1;
    if (nodeCount > limits.maxTreeNodes) {
      truncated = true;
      return undefined;
    }
    // A static text fragment is serialized as a bare string, not an object with role: "text"
    // (Playwright's own `ariaSnapshotJSON` format).
    if (typeof node === 'string') {
      return { role: TEXT_ROLE, text: normalizeText(node) };
    }
    const record =
      typeof node === 'object' && node !== null && !Array.isArray(node)
        ? (node as Record<string, unknown>)
        : {};
    const result: AccessibilityNode = { role: typeof record.role === 'string' ? record.role : FALLBACK_ROLE };
    if (typeof record.name === 'string') {
      result.name = normalizeText(record.name);
    }
    if (typeof record.text === 'string') {
      result.text = normalizeText(record.text);
    }
    for (const flag of BOOLEAN_FLAGS) {
      if (typeof record[flag] === 'boolean') {
        result[flag] = record[flag];
      }
    }
    if (Array.isArray(record.children)) {
      const children = record.children
        .map(visit)
        .filter((child): child is AccessibilityNode => child !== undefined);
      if (children.length > 0) {
        result.children = children;
      }
    }
    return result;
  }

  // `ariaSnapshotJSON()` returns a *list* of root-level nodes, not one root object; a
  // single-element list is unwrapped, and a multi-element one gets a synthetic root so the
  // schema's single `accessibilityTree` field always has exactly one tree to hold.
  // `Array.isArray` narrows to `any[]`, so the elements are re-typed `unknown` explicitly.
  const rootNodes: unknown[] | undefined = Array.isArray(raw) ? (raw as unknown[]) : undefined;
  const rootInput: unknown =
    rootNodes === undefined
      ? raw
      : rootNodes.length === 1
        ? rootNodes[0]
        : { role: ROOT_ROLE, children: rootNodes };
  const tree = visit(rootInput) ?? { role: FALLBACK_ROLE };
  return { tree, truncated };
}
