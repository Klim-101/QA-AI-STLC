// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface NormalizeLimits {
  readonly maxTextLength: number;
  readonly maxArrayLength: number;
  readonly maxTreeNodes: number;
}

export const DEFAULT_NORMALIZE_LIMITS: NormalizeLimits = {
  maxTextLength: 200,
  maxArrayLength: 200,
  maxTreeNodes: 500,
};

const TRUNCATION_SUFFIX = '…';

/**
 * Caps a single piece of page-derived text (development plan section 2.6): untrusted content
 * from the application under test is never passed on unbounded. Returns the text unchanged, and
 * `truncated: false`, when it is already within the limit.
 */
export function truncateText(
  text: string,
  limits: NormalizeLimits = DEFAULT_NORMALIZE_LIMITS,
): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= limits.maxTextLength) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, limits.maxTextLength) + TRUNCATION_SUFFIX, truncated: true };
}

/**
 * Caps how many items of a page-derived list (interactive elements, table rows, ...) are kept.
 * Every element on a page still gets *counted* elsewhere; this only bounds how many are carried
 * into the artifact and, eventually, into an agent's context.
 */
export function capArray<T>(
  items: readonly T[],
  limits: NormalizeLimits = DEFAULT_NORMALIZE_LIMITS,
): { readonly items: readonly T[]; readonly truncated: boolean } {
  if (items.length <= limits.maxArrayLength) {
    return { items, truncated: false };
  }
  return { items: items.slice(0, limits.maxArrayLength), truncated: true };
}
