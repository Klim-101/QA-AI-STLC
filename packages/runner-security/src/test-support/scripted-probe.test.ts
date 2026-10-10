// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { authorizationFor, scriptedHttpClient } from './scripted-probe.js';

describe('scripted test support', () => {
  it('answers from the script and records the path, query and headers it was asked for', async () => {
    const { client, requests } = scriptedHttpClient(() => ({ status: 201, bodyText: 'made' }));

    const response = await client.request('http://app.example.test/a?b=1', { headers: { origin: 'x' } });

    expect(response).toMatchObject({ status: 201, bodyText: 'made', headers: {}, setCookies: [] });
    expect(requests).toEqual([{ path: '/a?b=1', headers: { origin: 'x' } }]);
  });

  it('records an empty header set when the request sent none', async () => {
    const { client, requests } = scriptedHttpClient(() => ({}));

    await client.request('http://app.example.test/');

    expect(requests[0]?.headers).toEqual({});
  });

  it('has no use for get()', async () => {
    await expect(scriptedHttpClient(() => ({})).client.get('http://app.example.test/')).rejects.toThrow(
      'not used',
    );
  });

  it('builds an authorization whose allowlist is the base URL host', () => {
    const authorization = authorizationFor('https://x.example.test/', { checks: ['cors'] });

    expect(authorization.environment).toEqual({
      name: 'staging',
      baseUrl: 'https://x.example.test/',
      allowlist: ['x.example.test'],
    });
    expect(authorization.checks).toEqual(['cors']);
  });
});
