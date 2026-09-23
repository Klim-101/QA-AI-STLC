// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { authenticate, type BrowserLauncher, type StorageState } from '@qa-ai-stlc/core';
import type { IdentityConfig } from '@qa-ai-stlc/schemas';

export interface ExplorerIdentity {
  readonly config: IdentityConfig;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Required, and only used, when `identity.config.auth` is `"cdp-attach"`. */
  readonly cdpEndpointUrl?: string;
}

/** Signs in through P1-05's `authenticate()` when an identity is given; `undefined` for an anonymous session. */
export async function resolveStorageState(
  browserLauncher: BrowserLauncher,
  identity: ExplorerIdentity | undefined,
  tlsInsecure = false,
): Promise<StorageState | undefined> {
  if (identity === undefined) {
    return undefined;
  }
  return authenticate(browserLauncher, identity.config, identity.env, {
    ...(identity.cdpEndpointUrl !== undefined ? { cdpEndpointUrl: identity.cdpEndpointUrl } : {}),
    ...(tlsInsecure ? { tlsInsecure: true } : {}),
  });
}
