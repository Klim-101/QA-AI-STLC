// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { attachViaCdp, authenticate, loginWithCredentials } from './auth.js';
import { QaError } from './errors.js';
import type { AuthBrowserContext, StorageState } from './ports/browser-launcher.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';

const SESSION: StorageState = {
  cookies: [
    {
      name: 'session',
      value: 'abc',
      domain: 'example.com',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ],
  origins: [],
};

describe('attachViaCdp', () => {
  it('returns the storage state of the first existing context', async () => {
    const context: AuthBrowserContext = {
      newPage: () => Promise.reject(new Error('not used')),
      storageState: () => Promise.resolve(SESSION),
      close: () => Promise.resolve(),
    };
    const launcher = createFakeBrowserLauncher({ contexts: [context] });

    const result = await attachViaCdp(launcher, 'http://localhost:9222');

    expect(result).toBe(SESSION);
  });

  it('never closes the attached browser', async () => {
    const context: AuthBrowserContext = {
      newPage: () => Promise.reject(new Error('not used')),
      storageState: () => Promise.resolve(SESSION),
      close: () => Promise.resolve(),
    };
    const launcher = createFakeBrowserLauncher({ contexts: [context] });

    await attachViaCdp(launcher, 'http://localhost:9222');

    expect(launcher.closedBrowsers).toBe(0);
  });

  it('throws CDP_NO_CONTEXT when the attached browser has no context', async () => {
    const launcher = createFakeBrowserLauncher({ contexts: [] });

    const error = await attachViaCdp(launcher, 'http://localhost:9222').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CDP_NO_CONTEXT');
  });
});

describe('loginWithCredentials', () => {
  it('navigates, fills default selectors, submits, and returns the storage state', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });

    const result = await loginWithCredentials(launcher, {
      loginUrl: 'https://example.com/login',
      username: 'qa.admin@example.com',
      password: 'hunter2',
    });

    expect(result).toBe(SESSION);
    expect(launcher.pageCalls).toEqual([
      { method: 'goto', args: ['https://example.com/login'] },
      {
        method: 'fill',
        args: [
          'input[type="email"], input[name="username"], input[id="username"], input[autocomplete="username"]',
          'qa.admin@example.com',
        ],
      },
      { method: 'fill', args: ['input[type="password"]', 'hunter2'] },
      { method: 'click', args: ['button[type="submit"], input[type="submit"]'] },
      { method: 'waitForLoadState', args: ['networkidle'] },
    ]);
  });

  it('uses explicit selectors when given', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });

    await loginWithCredentials(launcher, {
      loginUrl: 'https://example.com/login',
      username: 'qa.admin@example.com',
      password: 'hunter2',
      usernameSelector: '#email',
      passwordSelector: '#pass',
      submitSelector: '#go',
    });

    expect(launcher.pageCalls).toEqual([
      { method: 'goto', args: ['https://example.com/login'] },
      { method: 'fill', args: ['#email', 'qa.admin@example.com'] },
      { method: 'fill', args: ['#pass', 'hunter2'] },
      { method: 'click', args: ['#go'] },
      { method: 'waitForLoadState', args: ['networkidle'] },
    ]);
  });

  it('always closes the browser it launched, even on failure', async () => {
    let closed = false;
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });
    launcher.launch = () =>
      Promise.resolve({
        newContext: () =>
          Promise.resolve({
            newPage: () => Promise.reject(new Error('boom')),
            storageState: () => Promise.resolve(SESSION),
            close: () => Promise.resolve(),
          }),
        contexts: () => [],
        close: () => {
          closed = true;
          return Promise.resolve();
        },
      });

    await expect(
      loginWithCredentials(launcher, {
        loginUrl: 'https://example.com/login',
        username: 'a',
        password: 'b',
      }),
    ).rejects.toThrow('boom');
    expect(closed).toBe(true);
  });
});

describe('authenticate', () => {
  const cdpIdentity: IdentityConfig = { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' };
  const loginIdentity: IdentityConfig = {
    auth: 'storage-state',
    secret: 'QA_ADMIN_PASSWORD',
    loginUrl: 'https://example.com/login',
    username: 'qa.admin@example.com',
  };

  it('dispatches to attachViaCdp for a cdp-attach identity', async () => {
    const context: AuthBrowserContext = {
      newPage: () => Promise.reject(new Error('not used')),
      storageState: () => Promise.resolve(SESSION),
      close: () => Promise.resolve(),
    };
    const launcher = createFakeBrowserLauncher({ contexts: [context] });

    const result = await authenticate(launcher, cdpIdentity, {}, { cdpEndpointUrl: 'http://localhost:9222' });

    expect(result).toBe(SESSION);
  });

  it('throws CDP_ENDPOINT_MISSING when a cdp-attach identity has no endpoint URL', async () => {
    const launcher = createFakeBrowserLauncher();

    const error = await authenticate(launcher, cdpIdentity, {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CDP_ENDPOINT_MISSING');
  });

  it('dispatches to loginWithCredentials for a storage-state identity', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });

    const result = await authenticate(launcher, loginIdentity, { QA_ADMIN_PASSWORD: 'hunter2' });

    expect(result).toBe(SESSION);
    expect(launcher.pageCalls[1]?.args).toContain('qa.admin@example.com');
  });

  it('passes through custom selectors from identity config', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: SESSION });
    const identity: IdentityConfig = {
      ...loginIdentity,
      selectors: { username: '#u', password: '#p', submit: '#s' },
    };

    await authenticate(launcher, identity, { QA_ADMIN_PASSWORD: 'hunter2' });

    expect(launcher.pageCalls).toContainEqual({ method: 'fill', args: ['#u', 'qa.admin@example.com'] });
    expect(launcher.pageCalls).toContainEqual({ method: 'fill', args: ['#p', 'hunter2'] });
    expect(launcher.pageCalls).toContainEqual({ method: 'click', args: ['#s'] });
  });

  it('throws IDENTITY_SECRET_MISSING when the secret env var is unset', async () => {
    const launcher = createFakeBrowserLauncher();

    const error = await authenticate(launcher, loginIdentity, {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('IDENTITY_SECRET_MISSING');
  });

  it('throws IDENTITY_SECRET_MISSING when the secret env var is empty', async () => {
    const launcher = createFakeBrowserLauncher();

    const error = await authenticate(launcher, loginIdentity, { QA_ADMIN_PASSWORD: '' }).catch(
      (caught: unknown) => caught,
    );

    expect((error as QaError).code).toBe('IDENTITY_SECRET_MISSING');
  });

  it('throws LOGIN_CONFIG_INCOMPLETE for a hand-built storage-state identity missing loginUrl/username', async () => {
    const launcher = createFakeBrowserLauncher();
    const identity = { auth: 'storage-state', secret: 'QA_ADMIN_PASSWORD' } as IdentityConfig;

    const error = await authenticate(launcher, identity, { QA_ADMIN_PASSWORD: 'hunter2' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LOGIN_CONFIG_INCOMPLETE');
  });
});
