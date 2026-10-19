// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from './browser-allowlist.js';

export interface ContractFetchSettings {
  readonly tlsInsecure: boolean;
  /** Absent when no environment that serves the contract sets a limit. */
  readonly timeoutMs?: number;
}

/**
 * The settings a contract URL is fetched with, taken from the environments that serve it: the ones
 * whose allowlist, scheme and port admit the URL (the same rule the browser applies). With none, the
 * contract is fetched with defaults. TLS validation is skipped only when every serving environment
 * asks for it, so one environment cannot weaken the check on behalf of another; the longest limit
 * wins, so one slow environment is not cut off by a faster one.
 */
export function resolveContractFetchSettings(
  contractUrl: string,
  environments: Readonly<Record<string, EnvironmentConfig>>,
): ContractFetchSettings {
  const serving = Object.values(environments).filter((environment) =>
    isUrlAllowed(contractUrl, environment.allowlist, environment.baseUrl),
  );
  const timeouts = serving.flatMap((environment) =>
    environment.reachabilityTimeoutMs === undefined ? [] : [environment.reachabilityTimeoutMs],
  );
  return {
    tlsInsecure: serving.length > 0 && serving.every((environment) => environment.tlsInsecure === true),
    ...(timeouts.length === 0 ? {} : { timeoutMs: Math.max(...timeouts) }),
  };
}
