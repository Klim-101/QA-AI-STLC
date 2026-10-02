// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_NORMALIZE_LIMITS,
  normalizeAccessibilityTree,
  type AuthPage,
  type NormalizeLimits,
} from '@qa-ai-stlc/core';
import type { PageModel } from '@qa-ai-stlc/schemas';
import { waitUntilLibraryReady, type ComponentLibraryProfile } from './component-library-profile.js';
import { extractPageElements } from './page-elements.js';

/**
 * Builds a `PageModel` for the page `page` is currently showing: its accessibility tree,
 * interactive elements, forms, tables and dialogs, all length- and count-capped (development plan
 * section 2.6). Does not navigate; the caller decides which URL is current.
 */
export async function analyzePage(
  page: AuthPage,
  url: string,
  testIdAttribute: string,
  limits: NormalizeLimits = DEFAULT_NORMALIZE_LIMITS,
  extraStableAttributes: readonly string[] = [],
  profile?: ComponentLibraryProfile,
): Promise<PageModel> {
  await waitUntilLibraryReady(page, profile);
  const rawAccessibilityTree = await page.ariaSnapshotJSON();
  const { tree, truncated: accessibilityTruncated } = normalizeAccessibilityTree(
    rawAccessibilityTree,
    limits,
  );
  const elements = await extractPageElements(
    page,
    limits,
    testIdAttribute,
    extraStableAttributes,
    profile?.widgets ?? [],
  );

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
