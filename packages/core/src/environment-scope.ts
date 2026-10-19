// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from './browser-allowlist.js';

/**
 * The environment an operation acts on (ADR-0020): its name, and the address rules that decide which
 * stored elements are its own when they do not say so themselves.
 */
export interface EnvironmentScope {
  readonly name: string;
  readonly baseUrl: string;
  readonly allowlist: readonly string[];
}

/** What a stored selector element or endpoint says about where it came from. */
export interface EnvironmentScoped {
  readonly environment?: string | undefined;
  readonly pageUrl?: string | undefined;
}

export function scopeOfEnvironment(
  name: string,
  environment: Pick<EnvironmentConfig, 'baseUrl' | 'allowlist'>,
): EnvironmentScope {
  return { name, baseUrl: environment.baseUrl, allowlist: environment.allowlist };
}

/**
 * Whether a stored item belongs to `scope`. One that names its environment belongs to that one only.
 * One that does not (written before the field existed) belongs to the environment whose address rules
 * admit its page, and, with no page at all (found in the source, or an endpoint, which has a path but
 * no origin), to every environment. So an old registry keeps working, and is claimed by the first
 * environment that explores it again.
 */
export function isInEnvironment(item: EnvironmentScoped, scope: EnvironmentScope): boolean {
  if (item.environment !== undefined) {
    return item.environment === scope.name;
  }
  if (item.pageUrl === undefined) {
    return true;
  }
  return isUrlAllowed(item.pageUrl, scope.allowlist, scope.baseUrl);
}

export interface EnvironmentPartition<TItem> {
  readonly inScope: TItem[];
  readonly outOfScope: TItem[];
}

export function partitionByEnvironment<TItem extends EnvironmentScoped>(
  items: readonly TItem[],
  scope: EnvironmentScope,
): EnvironmentPartition<TItem> {
  return {
    inScope: items.filter((item) => isInEnvironment(item, scope)),
    outOfScope: items.filter((item) => !isInEnvironment(item, scope)),
  };
}

/**
 * Records `scope`'s environment on an element that has a page and names none, so a registry written
 * before the field existed is claimed one element at a time as it is explored again. An element with
 * no page is not tied to an environment and is left as it is.
 */
export function withEnvironment<TItem extends EnvironmentScoped>(
  item: TItem,
  scope: EnvironmentScope,
): TItem {
  return item.environment === undefined && item.pageUrl !== undefined
    ? { ...item, environment: scope.name }
    : item;
}

/** The items of `scope`'s environment, in their order. */
export function inEnvironmentOf<TItem extends EnvironmentScoped>(
  items: readonly TItem[],
  scope: EnvironmentScope,
): TItem[] {
  return partitionByEnvironment(items, scope).inScope;
}
