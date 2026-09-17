// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage, PageLocator, ViewportSize } from '@qa-ai-stlc/core';
import { QaError } from '@qa-ai-stlc/core';
import type { LocatorCandidate } from '@qa-ai-stlc/schemas';

export interface StabilityScoringOptions {
  /** Viewport sizes checked after uniqueness and reload survival; defaults to desktop/tablet/mobile. */
  readonly viewports?: readonly ViewportSize[];
}

export const DEFAULT_VIEWPORTS: readonly ViewportSize[] = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
];

interface RoleCandidateValue {
  readonly role: string;
  readonly name?: string;
}

function parseRoleCandidateValue(value: string): RoleCandidateValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new QaError(
      'locator-candidate-invalid',
      `Role locator candidate value is not valid JSON: "${value}".`,
      { cause },
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).role !== 'string'
  ) {
    throw new QaError(
      'locator-candidate-invalid',
      `Role locator candidate value has no "role" string: "${value}".`,
    );
  }
  const record = parsed as Record<string, unknown>;
  return typeof record.name === 'string'
    ? { role: record.role as string, name: record.name }
    : { role: record.role as string };
}

/** Resolves one of P1-08's `LocatorCandidate` values to a live `PageLocator`, by strategy. */
export function resolveCandidateLocator(page: AuthPage, candidate: LocatorCandidate): PageLocator {
  switch (candidate.strategy) {
    case 'role': {
      const { role, name } = parseRoleCandidateValue(candidate.value);
      return page.getByRole(role, name === undefined ? undefined : { name });
    }
    case 'testId':
      return page.getByTestId(candidate.value);
    case 'label':
      return page.getByLabel(candidate.value);
    case 'placeholder':
      return page.getByPlaceholder(candidate.value);
    case 'text':
      return page.getByText(candidate.value);
    case 'css':
      return page.locator(candidate.value);
    default:
      throw new QaError('locator-strategy-unknown', `Unknown locator strategy "${candidate.strategy}".`);
  }
}

async function isUniqueMatch(page: AuthPage, candidate: LocatorCandidate): Promise<boolean> {
  const count = await resolveCandidateLocator(page, candidate).count();
  return count === 1;
}

/**
 * Verifies one locator candidate against the current live page: uniqueness now, then survival
 * across a reload and across each configured viewport size (development plan section 6.3.5).
 * Uniqueness is a hard gate — a candidate that does not resolve to exactly one element right now
 * cannot be called stable, so reload/viewport are never checked against a candidate that has
 * already failed. The page's original viewport size is restored before returning, so scoring one
 * element's candidate does not affect the next.
 */
export async function scoreLocatorStability(
  page: AuthPage,
  candidate: LocatorCandidate,
  options: StabilityScoringOptions = {},
): Promise<number> {
  if (!(await isUniqueMatch(page, candidate))) {
    return 0;
  }

  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const originalViewport = page.viewportSize();
  let survivedChecks = 0;

  await page.reload();
  if (await isUniqueMatch(page, candidate)) {
    survivedChecks += 1;
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    if (await isUniqueMatch(page, candidate)) {
      survivedChecks += 1;
    }
  }

  if (originalViewport !== null) {
    await page.setViewportSize(originalViewport);
  }

  return survivedChecks / (1 + viewports.length);
}
