// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { authenticate, withDefaultLoginSelectors } from './auth.js';
import { loadConfig } from './config-loader.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import type { StorageState } from './ports/browser-launcher.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';

/**
 * Signs in as `identityName` for a runner's browser contexts and returns the resulting storage
 * state, which the caller hands to Playwright and must never log, report or register as evidence.
 *
 * A login that did not take (wrong password, a form the selectors do not match) leaves a session
 * with no cookie and no stored origin. Handing that to the specs would run them against the login
 * page and report their failures as product defects, so it fails here instead.
 */
export async function signInForRun(
  engine: EngineContext,
  identityName: string,
  environmentName: string | undefined,
): Promise<StorageState> {
  const config = await loadConfig(engine);
  const identityConfig = config.identities[identityName];
  if (identityConfig === undefined) {
    throw new QaError('RUN_IDENTITY_UNKNOWN', `No identity named "${identityName}" in config.yaml`, {
      remediation: `Use one of: ${Object.keys(config.identities).join(', ') || '(none configured)'}.`,
    });
  }
  if (identityConfig.auth === 'cdp-attach') {
    throw new QaError(
      'RUN_IDENTITY_UNSUPPORTED',
      `Identity "${identityName}" attaches to a running browser, which a spec run cannot do.`,
      { remediation: 'Run specs with an identity whose auth is "storage-state".' },
    );
  }

  const environment = resolveBrowserEnvironment(config, environmentName);
  let storageState: StorageState;
  try {
    storageState = await authenticate(
      engine.browserLauncher,
      withDefaultLoginSelectors(identityConfig, config),
      engine.env,
      {
        allowlist: environment.config.allowlist,
        baseUrl: environment.config.baseUrl,
        ...(environment.config.tlsInsecure === true ? { tlsInsecure: true } : {}),
      },
    );
  } catch (error) {
    if (error instanceof QaError) {
      throw error;
    }
    throw new QaError('RUN_SIGN_IN_FAILED', `Signing in as identity "${identityName}" failed.`, {
      remediation:
        'Check that the login URL is reachable and the login selectors match the form, then run again.',
      cause: error,
    });
  }

  if (storageState.cookies.length === 0 && storageState.origins.length === 0) {
    throw new QaError(
      'RUN_SIGN_IN_FAILED',
      `Signing in as identity "${identityName}" produced no session, so the specs would run against the login page.`,
      {
        remediation: `Check the username and the ${identityConfig.secret} value, and the login selectors, for this identity.`,
      },
    );
  }
  return storageState;
}
