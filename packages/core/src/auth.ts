// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import type { AuthBrowser, BrowserLauncher, StorageState } from './ports/browser-launcher.js';

// Generic fallbacks for a login form the operator has not described in config.yaml
// (development plan section 6.2); given only when `identity.selectors` omits one.
const DEFAULT_USERNAME_SELECTOR =
  'input[type="email"], input[name="username"], input[id="username"], input[autocomplete="username"]';
const DEFAULT_PASSWORD_SELECTOR = 'input[type="password"]';
const DEFAULT_SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]';

/**
 * Attaches to a browser the operator has already signed into (`connectOverCDP`), covering SSO,
 * MFA and custom redirects the framework never has to reproduce. Never closes the attached
 * browser: it belongs to the operator, not the engine.
 */
export async function attachViaCdp(launcher: BrowserLauncher, endpointUrl: string): Promise<StorageState> {
  const browser = await launcher.connectOverCdp(endpointUrl);
  const context = browser.contexts()[0];
  if (context === undefined) {
    throw new QaError('CDP_NO_CONTEXT', `No browser context found at "${endpointUrl}"`, {
      remediation:
        'Open at least one tab in the browser started with --remote-debugging-port before attaching.',
    });
  }
  return context.storageState();
}

export interface LoginCredentials {
  readonly loginUrl: string;
  readonly username: string;
  readonly password: string;
  readonly usernameSelector?: string;
  readonly passwordSelector?: string;
  readonly submitSelector?: string;
}

/** Scripted login with secrets from environment variables (development plan section 6.2 step 2). */
export async function loginWithCredentials(
  launcher: BrowserLauncher,
  credentials: LoginCredentials,
): Promise<StorageState> {
  const browser: AuthBrowser = await launcher.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(credentials.loginUrl);
    await page.fill(credentials.usernameSelector ?? DEFAULT_USERNAME_SELECTOR, credentials.username);
    await page.fill(credentials.passwordSelector ?? DEFAULT_PASSWORD_SELECTOR, credentials.password);
    await page.click(credentials.submitSelector ?? DEFAULT_SUBMIT_SELECTOR);
    await page.waitForLoadState('networkidle');
    return await context.storageState();
  } finally {
    await browser.close();
  }
}

export interface AuthenticateOptions {
  /** Required, and only used, when `identity.auth` is `"cdp-attach"`. */
  readonly cdpEndpointUrl?: string;
}

/**
 * Produces a reusable session for one configured identity, dispatching to the CDP-attach or
 * scripted-login path per `identity.auth` (development plan section 6.2).
 */
export async function authenticate(
  launcher: BrowserLauncher,
  identity: IdentityConfig,
  env: Readonly<Record<string, string | undefined>>,
  options: AuthenticateOptions = {},
): Promise<StorageState> {
  if (identity.auth === 'cdp-attach') {
    if (options.cdpEndpointUrl === undefined) {
      throw new QaError('CDP_ENDPOINT_MISSING', 'No CDP endpoint URL was given for a "cdp-attach" identity', {
        remediation: 'Start Chrome with --remote-debugging-port and pass its endpoint URL.',
      });
    }
    return attachViaCdp(launcher, options.cdpEndpointUrl);
  }

  const password = env[identity.secret];
  if (password === undefined || password === '') {
    throw new QaError('IDENTITY_SECRET_MISSING', `Environment variable "${identity.secret}" is not set`, {
      remediation: `Set ${identity.secret} before authenticating this identity.`,
    });
  }
  // The schema requires loginUrl and username whenever auth is "storage-state" (packages/schemas
  // IdentityConfigSchema); a config that reached this point without them is not one qa validate
  // would have accepted, but the check stays for anyone constructing IdentityConfig by hand.
  if (identity.loginUrl === undefined || identity.username === undefined) {
    throw new QaError(
      'LOGIN_CONFIG_INCOMPLETE',
      'A "storage-state" identity needs both loginUrl and username',
      {
        remediation: 'Set identities.<name>.loginUrl and identities.<name>.username in config.yaml.',
      },
    );
  }
  return loginWithCredentials(launcher, {
    loginUrl: identity.loginUrl,
    username: identity.username,
    password,
    ...(identity.selectors?.username !== undefined ? { usernameSelector: identity.selectors.username } : {}),
    ...(identity.selectors?.password !== undefined ? { passwordSelector: identity.selectors.password } : {}),
    ...(identity.selectors?.submit !== undefined ? { submitSelector: identity.selectors.submit } : {}),
  });
}
