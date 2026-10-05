// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AuthBrowser, AuthBrowserContext, AuthPage } from '../ports/browser-launcher.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
  type BrowserTestHarness,
  type BrowserTestHarnessOptions,
} from '../test-support/browser-session-harness.js';
import { runBrowserAttach } from './browser-attach.js';

const STAGING_URL = 'https://staging.example.test/app';
const ENDPOINT = 'http://127.0.0.1:9222';

interface OperatorBrowser {
  readonly harness: BrowserTestHarness;
  readonly pages: readonly AuthPage[];
  readonly closeBrowser: ReturnType<typeof vi.fn>;
  readonly closeContext: ReturnType<typeof vi.fn>;
  readonly onContext: ReturnType<typeof vi.fn>;
  readonly connect: ReturnType<typeof vi.fn>;
}

// A browser the operator already runs: one context holding the given pages, each at a URL.
async function operatorBrowser(
  pageUrls: readonly string[],
  harnessOptions: BrowserTestHarnessOptions = {},
): Promise<OperatorBrowser> {
  const harness = createBrowserTestHarness(harnessOptions);
  const launched = await harness.launcher.launch();
  const launchedContext = await launched.newContext();
  const pages: AuthPage[] = [];
  for (const url of pageUrls) {
    const page = await launchedContext.newPage();
    await page.goto(url);
    pages.push(page);
  }
  const closeContext = vi.fn(() => Promise.resolve());
  const closeBrowser = vi.fn(() => Promise.resolve());
  const onContext = vi.fn();
  const context: AuthBrowserContext = { ...launchedContext, on: onContext, close: closeContext };
  const browser: AuthBrowser = {
    newContext: () => Promise.reject(new Error('an attached browser is not given a new context')),
    contexts: () => [context],
    close: closeBrowser,
  };
  const connect = vi.fn(() => Promise.resolve(browser));
  harness.launcher.connectOverCdp = connect;
  return { harness, pages, closeBrowser, closeContext, onContext, connect };
}

interface FakeRoute {
  request: () => { method: () => string; url: () => string };
  abort: () => Promise<void>;
  continue: () => Promise<void>;
}

function postRoute(url: string, outcomes: string[]): FakeRoute {
  return {
    request: () => ({ method: () => 'POST', url: () => url }),
    abort: () => {
      outcomes.push('abort');
      return Promise.resolve();
    },
    continue: () => {
      outcomes.push('continue');
      return Promise.resolve();
    },
  };
}

function pageRouteHandler(operator: OperatorBrowser): (route: unknown) => Promise<void> {
  const call = operator.harness.launcher.pageCalls.find((entry) => entry.method === 'route');
  return call?.args[1] as (route: unknown) => Promise<void>;
}

describe('runBrowserAttach', () => {
  it('attaches to the operator page on the allowlist and registers it as evidence', async () => {
    const operator = await operatorBrowser([STAGING_URL]);

    const result = await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });

    expect(result).toMatchObject({
      environment: 'staging',
      baseUrl: 'https://staging.example.test/',
      allowlist: ['staging.example.test'],
      pageUrl: STAGING_URL,
    });
    expect(result.notes.join(' ')).toContain('from the moment of attachment');
    expect(result.evidence).toMatchObject({ kind: 'action', redacted: false });
    const written = operator.harness.fs.getRawFile(join('project', '.qa', result.evidence.path));
    expect(JSON.parse(String(written))).toMatchObject({ type: 'attach', url: STAGING_URL });
    const session = await operator.harness.sessions.get(result.sessionId);
    expect(session.ownsBrowser).toBe(false);
    expect(session.page).toBe(operator.pages[0]);
  });

  it('bounds the connection with the environment navigation timeout', async () => {
    const operator = await operatorBrowser([STAGING_URL]);

    await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });

    expect(operator.connect).toHaveBeenCalledWith(ENDPOINT, { timeoutMs: 30_000 });
  });

  it('skips operator pages that are off the allowlist', async () => {
    const operator = await operatorBrowser(['https://mail.example.test/inbox', 'about:blank', STAGING_URL]);

    const result = await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });

    const session = await operator.harness.sessions.get(result.sessionId);
    expect(session.page).toBe(operator.pages[2]);
  });

  it('applies safe mode to the driven page only, never to the operator context', async () => {
    const operator = await operatorBrowser([STAGING_URL]);
    const { launcher } = operator.harness;

    await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });

    expect(launcher.pageCalls.filter((call) => call.method === 'route')).toHaveLength(1);
    expect(launcher.pageCalls.filter((call) => call.method === 'contextRoute')).toHaveLength(0);
    const outcomes: string[] = [];
    const handler = pageRouteHandler(operator);
    await handler(postRoute('https://staging.example.test/save', outcomes));
    await handler(postRoute('https://elsewhere.example.test/save', outcomes));
    expect(outcomes).toEqual(['abort', 'abort']);
  });

  it('lets a non-GET request within the allowlist through only in execution mode (ADR-0009)', async () => {
    const operator = await operatorBrowser([STAGING_URL]);

    await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT, executionMode: true });

    const outcomes: string[] = [];
    const handler = pageRouteHandler(operator);
    await handler(postRoute('https://staging.example.test/save', outcomes));
    await handler(postRoute('https://elsewhere.example.test/save', outcomes));
    expect(outcomes).toEqual(['continue', 'abort']);
  });

  it('observes the request headers a from-browser profile replays, from attachment onward', async () => {
    const operator = await operatorBrowser([STAGING_URL], {
      configYaml: `${BROWSER_TEST_CONFIG_YAML}apiAuth:\n  profiles:\n    viaHeader: { type: from-browser, source: { kind: request-header, header: Authorization } }\n`,
    });
    const result = await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });

    await pageRouteHandler(operator)({
      request: () => ({
        method: () => 'GET',
        url: () => 'https://staging.example.test/api/me',
        allHeaders: () => Promise.resolve({ authorization: 'Bearer abc' }),
      }),
      abort: () => Promise.resolve(),
      continue: () => Promise.resolve(),
    });

    const session = await operator.harness.sessions.get(result.sessionId);
    expect(session.observedRequestHeaders.get('authorization')).toBe('Bearer abc');
  });

  it('passes the dialog policy to the session', async () => {
    const operator = await operatorBrowser([STAGING_URL]);

    const result = await runBrowserAttach(operator.harness.context, {
      endpoint: ENDPOINT,
      dialogPolicy: 'accept',
    });

    expect((await operator.harness.sessions.get(result.sessionId)).dialogPolicy).toBe('accept');
  });

  it('does not adopt or close pages the operator or the application opens later', async () => {
    const operator = await operatorBrowser([STAGING_URL]);

    const result = await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });
    operator.harness.launcher.openPopup('https://mail.example.test/inbox');

    expect(operator.onContext).not.toHaveBeenCalled();
    expect((await operator.harness.sessions.get(result.sessionId)).tabs).toHaveLength(1);
    expect(operator.harness.launcher.closedPages).toEqual([]);
  });

  it('disconnects on close and leaves the operator browser and its tabs open', async () => {
    const operator = await operatorBrowser([STAGING_URL]);
    const result = await runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT });

    await operator.harness.sessions.close(result.sessionId);

    expect(operator.closeBrowser).toHaveBeenCalledOnce();
    expect(operator.closeContext).not.toHaveBeenCalled();
    expect(operator.harness.launcher.closedPages).toEqual([]);
  });

  it('refuses an endpoint that is not on this machine before connecting', async () => {
    const operator = await operatorBrowser([STAGING_URL]);

    await expect(
      runBrowserAttach(operator.harness.context, { endpoint: 'http://203.0.113.7:9222' }),
    ).rejects.toMatchObject({ code: 'BROWSER_ATTACH_ENDPOINT_NOT_LOOPBACK' });

    expect(operator.connect).not.toHaveBeenCalled();
  });

  it('reports a failed connection with a remediation and the cause', async () => {
    const operator = await operatorBrowser([STAGING_URL]);
    const refused = new Error('ECONNREFUSED');
    operator.harness.launcher.connectOverCdp = () => Promise.reject(refused);

    await expect(runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT })).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_FAILED',
      cause: refused,
      remediation: expect.stringContaining('--remote-debugging-port') as string,
    });
  });

  it('disconnects and fails when no open page is on the allowlist', async () => {
    const operator = await operatorBrowser(['https://mail.example.test/inbox']);

    await expect(runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT })).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_NO_PAGE',
    });

    expect(operator.closeBrowser).toHaveBeenCalledOnce();
    expect(operator.closeContext).not.toHaveBeenCalled();
    expect(operator.harness.sessions.sessionIds).toEqual([]);
  });

  it('fails with CONFIG_MISSING in a project with no .qa/ store, without connecting', async () => {
    const operator = await operatorBrowser([STAGING_URL], { configYaml: null });

    await expect(runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT })).rejects.toMatchObject({
      code: 'CONFIG_MISSING',
    });

    expect(operator.connect).not.toHaveBeenCalled();
  });

  it('closes the session, and disconnects, when its own record could not be registered', async () => {
    // A page URL carrying what looks like a JWT: the evidence store quarantines the record.
    const operator = await operatorBrowser([`${STAGING_URL}?t=eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM`]);

    await expect(runBrowserAttach(operator.harness.context, { endpoint: ENDPOINT })).rejects.toMatchObject({
      code: 'BROWSER_EVIDENCE_QUARANTINED',
    });

    expect(operator.harness.sessions.sessionIds).toEqual([]);
    expect(operator.closeBrowser).toHaveBeenCalledOnce();
    expect(operator.closeContext).not.toHaveBeenCalled();
  });
});
