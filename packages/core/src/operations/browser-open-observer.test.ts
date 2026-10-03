// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { RouteRequest } from '../ports/browser-launcher.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserOpen } from './browser-open.js';

const CONFIG_WITH_HEADER_PROFILE = `${BROWSER_TEST_CONFIG_YAML}apiAuth:
  profiles:
    spa: { type: from-browser, source: { kind: request-header, header: X-Auth-Token } }
`;

type Handler = (route: {
  request: () => RouteRequest;
  abort: () => Promise<void>;
  continue: () => Promise<void>;
}) => Promise<void>;

function routeFor(url: string, headers: Record<string, string>) {
  return {
    request: (): RouteRequest => ({
      method: () => 'GET',
      url: () => url,
      allHeaders: () => Promise.resolve(headers),
    }),
    abort: () => Promise.resolve(),
    continue: () => Promise.resolve(),
  };
}

describe('runBrowserOpen observing request headers for a from-browser profile', () => {
  it('remembers the configured header of allowlisted requests on the session, and nothing else', async () => {
    const harness = createBrowserTestHarness({ configYaml: CONFIG_WITH_HEADER_PROFILE });
    const { sessionId } = await runBrowserOpen(harness.context);
    const handler = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute')
      ?.args[1] as Handler;

    await handler(
      routeFor('https://staging.example.test/api', { 'X-Auth-Token': 'seen-token', Authorization: 'other' }),
    );
    await handler(routeFor('https://evil.test/api', { 'X-Auth-Token': 'evil-token' }));

    const session = await harness.sessions.get(sessionId);
    expect([...session.observedRequestHeaders]).toEqual([['x-auth-token', 'seen-token']]);
  });

  it('records nothing when no profile replays a request header', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    const handler = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute')
      ?.args[1] as Handler;

    await handler(routeFor('https://staging.example.test/api', { Authorization: 'Bearer x' }));

    expect((await harness.sessions.get(sessionId)).observedRequestHeaders.size).toBe(0);
  });
});
