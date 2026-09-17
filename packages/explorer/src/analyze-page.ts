// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import type { PageModel } from '@qa-ai-stlc/schemas';
import { normalizeAccessibilityTree } from './accessibility-tree.js';
import { DEFAULT_NORMALIZE_LIMITS, type NormalizeLimits } from './normalize.js';
import { extractPageElements } from './page-elements.js';

/**
 * Builds a `PageModel` for the page `page` is currently showing: its accessibility tree,
 * interactive elements, forms, tables and dialogs, all length- and count-capped (development plan
 * section 2.6). Does not navigate; the caller decides which URL is current.
 */
export async function analyzePage(
  page: AuthPage,
  url: string,
  limits: NormalizeLimits = DEFAULT_NORMALIZE_LIMITS,
): Promise<PageModel> {
  const rawAccessibilityTree = await page.ariaSnapshotJSON();
  const { tree, truncated: accessibilityTruncated } = normalizeAccessibilityTree(
    rawAccessibilityTree,
    limits,
  );
  const elements = await extractPageElements(page, limits);

  return {
    url,
    accessibilityTree: tree,
    interactiveElements: elements.interactiveElements,
    forms: elements.forms,
    tables: elements.tables,
    dialogs: elements.dialogs,
    truncated: accessibilityTruncated || elements.truncated,
  };
}
