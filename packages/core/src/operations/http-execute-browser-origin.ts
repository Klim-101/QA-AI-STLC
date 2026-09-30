// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config, EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { AuthSessionStore } from '../auth-session-store.js';
import type { BrowserSessionStore } from '../browser-session-store.js';
import {
  createSessionOrigin,
  createStorageStateOrigin,
  type BrowserTokenOrigin,
} from '../browser-token-source.js';
import { QaError } from '../errors.js';
import type { QaStore } from '../qa-store.js';

export interface BrowserOriginOptions {
  /** An open `qa.browser_open` session that is signed in to the application. */
  readonly browserSessionId?: string;
  /** A configured identity whose saved storage state is read instead of a live session. */
  readonly identity?: string;
  readonly sessions?: BrowserSessionStore;
}

/**
 * Picks where a `from-browser` profile reads its token from: a live session or a saved storage
 * state, never both. A session belonging to another environment is refused, so a token is never
 * read from one application and sent to another (ADR-0012).
 */
export async function resolveBrowserTokenOrigin(
  options: BrowserOriginOptions,
  environment: EnvironmentConfig,
  config: Config,
  store: QaStore,
): Promise<BrowserTokenOrigin | undefined> {
  if (options.browserSessionId !== undefined && options.identity !== undefined) {
    throw new QaError(
      'API_AUTH_SESSION_AMBIGUOUS',
      'Both a browser session and an identity were given as the token source',
      { remediation: 'Pass one of them.' },
    );
  }
  if (options.browserSessionId !== undefined) {
    if (options.sessions === undefined) {
      throw new QaError(
        'BROWSER_SESSION_NOT_FOUND',
        `No open browser session "${options.browserSessionId}"`,
        {
          remediation: 'Open one with qa.browser_open, or check the session id from its result.',
        },
      );
    }
    const session = await options.sessions.get(options.browserSessionId);
    if (session.baseUrl !== environment.baseUrl) {
      throw new QaError(
        'API_AUTH_SESSION_MISMATCH',
        'The browser session belongs to a different environment than this call',
        { remediation: 'Open a session against the same environment, or pass the matching environment.' },
      );
    }
    return createSessionOrigin(session);
  }
  if (options.identity !== undefined) {
    // The name becomes part of a file path, so only a configured identity is accepted.
    if (!Object.hasOwn(config.identities, options.identity)) {
      throw new QaError('API_AUTH_IDENTITY_UNKNOWN', `"${options.identity}" is not a configured identity`, {
        remediation: `Use one of: ${Object.keys(config.identities).join(', ') || '(none configured)'}.`,
      });
    }
    const storageState = await new AuthSessionStore(store).load(options.identity);
    if (storageState === undefined) {
      throw new QaError(
        'API_AUTH_IDENTITY_NOT_AUTHENTICATED',
        `No saved storage state for identity "${options.identity}"`,
        { remediation: 'Authenticate that identity first, so a storage state is saved under .qa/auth/.' },
      );
    }
    return createStorageStateOrigin(storageState, environment);
  }
  return undefined;
}
