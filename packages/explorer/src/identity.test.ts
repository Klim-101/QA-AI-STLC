// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it } from 'vitest';
import { resolveStorageState, type ExplorerIdentity } from './identity.js';

const boundary = { allowlist: ['app.example.test'], baseUrl: 'https://app.example.test' };
const session = { cookies: [], origins: [] };

function identityWithLoginUrl(loginUrl: string): ExplorerIdentity {
  return {
    config: {
      auth: 'storage-state',
      secret: 'QA_ADMIN_PASSWORD',
      loginUrl,
      username: 'qa.admin@example.test',
    },
    env: { QA_ADMIN_PASSWORD: 'placeholder-password' },
  };
}

describe('resolveStorageState', () => {
  it('is anonymous when no identity is given', async () => {
    const launcher = createFakeBrowserLauncher();

    await expect(resolveStorageState(launcher, undefined, boundary)).resolves.toBeUndefined();
  });

  it('signs in through a login page the environment admits', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: session });

    const result = await resolveStorageState(
      launcher,
      identityWithLoginUrl('https://app.example.test/login'),
      boundary,
      true,
    );

    expect(result).toBe(session);
    expect(launcher.newContextCalls).toEqual([{ ignoreHttpsErrors: true }]);
  });

  it('refuses a login page outside the allowlist before any page is opened (P6-115)', async () => {
    const launcher = createFakeBrowserLauncher({ storageState: session });

    await expect(
      resolveStorageState(launcher, identityWithLoginUrl('https://elsewhere.example.net/login'), boundary),
    ).rejects.toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });
    expect(launcher.pageCalls).toEqual([]);
  });

  it('passes the CDP endpoint to a cdp-attach identity', async () => {
    const launcher = createFakeBrowserLauncher({ contexts: [] });
    const identity: ExplorerIdentity = {
      config: { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' },
      env: {},
      cdpEndpointUrl: 'http://localhost:9222',
    };

    await expect(resolveStorageState(launcher, identity, boundary)).rejects.toMatchObject({
      code: 'CDP_NO_CONTEXT',
    });
  });
});
