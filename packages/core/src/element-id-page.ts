// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { hashText } from './hash.js';
import type { EnvironmentScope } from './environment-scope.js';

/**
 * What an element id hashes in place of the page address (ADR-0020): the environment's name, and
 * the page's path, query and fragment when the page is on the origin of the environment's
 * `baseUrl`. The origin is left out there because a machine may serve the same environment on
 * another port, and an id must not change with it. A page on any other origin keeps its whole
 * address, since the path alone would not tell two services apart.
 */
export function pageKeyInEnvironment(pageUrl: string, scope: EnvironmentScope): string {
  const page = tryParseUrl(pageUrl);
  const base = tryParseUrl(scope.baseUrl);
  if (page === undefined || page.origin !== base?.origin) {
    return `${scope.name} ${pageUrl}`;
  }
  return `${scope.name} ${page.pathname}${page.search}${page.hash}`;
}

/** The id of an element registered from a live session, which has no crawl signal to hash. */
export function executedElementId(
  pageUrl: string,
  kind: string,
  selector: string,
  scope: EnvironmentScope,
): string {
  return hashText(`${pageKeyInEnvironment(pageUrl, scope)} ${kind} ${selector}`);
}

/** The id such an element had before ids left out the origin; only used to recognise and migrate it. */
export function legacyExecutedElementId(pageUrl: string, kind: string, selector: string): string {
  return hashText(`${pageUrl} ${kind} ${selector}`);
}

function tryParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
