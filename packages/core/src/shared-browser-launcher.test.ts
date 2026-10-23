// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type {
  AuthBrowser,
  AuthBrowserContext,
  BrowserLauncher,
  LaunchOptions,
} from './ports/browser-launcher.js';
import { createSharedBrowserLauncher } from './shared-browser-launcher.js';

interface Recorder {
  readonly launcher: BrowserLauncher;
  readonly launches: (LaunchOptions | undefined)[];
  readonly cdpEndpoints: string[];
  readonly contextCloses: number[];
  browserCloses: number;
}

function createRecorder(): Recorder {
  const recorder: Recorder = {
    launches: [],
    cdpEndpoints: [],
    contextCloses: [],
    browserCloses: 0,
    launcher: {
      launch: (options) => {
        recorder.launches.push(options);
        return Promise.resolve(createBrowser());
      },
      connectOverCdp: (endpointUrl) => {
        recorder.cdpEndpoints.push(endpointUrl);
        return Promise.resolve(createBrowser());
      },
    },
  };

  function createBrowser(): AuthBrowser {
    return {
      newContext: () => {
        const id = recorder.contextCloses.length;
        recorder.contextCloses.push(0);
        const context: AuthBrowserContext = {
          newPage: () => Promise.reject(new Error('not used')),
          pages: () => [],
          route: () => Promise.resolve(),
          on: () => undefined,
          storageState: () => Promise.resolve({ cookies: [], origins: [] }),
          close: () => {
            recorder.contextCloses[id] = (recorder.contextCloses[id] ?? 0) + 1;
            return Promise.resolve();
          },
        };
        return Promise.resolve(context);
      },
      contexts: () => [],
      close: () => {
        recorder.browserCloses += 1;
        return Promise.resolve();
      },
    };
  }

  return recorder;
}

describe('createSharedBrowserLauncher', () => {
  it('launches the real browser once however many times it is asked to', async () => {
    const recorder = createRecorder();
    const shared = createSharedBrowserLauncher(recorder.launcher);

    await shared.launch();
    await shared.launch();
    await shared.launch();

    expect(recorder.launches).toHaveLength(1);
  });

  it('launches a separate browser for a different headless setting', async () => {
    const recorder = createRecorder();
    const shared = createSharedBrowserLauncher(recorder.launcher);

    await shared.launch({ headless: true });
    await shared.launch({ headless: false });
    await shared.launch({ headless: false });

    expect(recorder.launches).toEqual([{ headless: true }, { headless: false }]);
  });

  it('keeps contexts apart: each lent browser sees and closes only its own', async () => {
    const recorder = createRecorder();
    const shared = createSharedBrowserLauncher(recorder.launcher);
    const first = await shared.launch();
    const second = await shared.launch();
    const firstContext = await first.newContext();
    await second.newContext();
    await second.newContext();

    expect(first.contexts()).toEqual([firstContext]);
    expect(second.contexts()).toHaveLength(2);

    await first.close();

    expect(recorder.contextCloses).toEqual([1, 0, 0]);
    expect(first.contexts()).toEqual([]);
    expect(recorder.browserCloses).toBe(0);
  });

  it('does not close a context a second time when a lent browser is closed twice', async () => {
    const recorder = createRecorder();
    const shared = createSharedBrowserLauncher(recorder.launcher);
    const lent = await shared.launch();
    await lent.newContext();

    await lent.close();
    await lent.close();

    expect(recorder.contextCloses).toEqual([1]);
  });

  it('closes the real browser only on dispose, and launches a fresh one afterwards', async () => {
    const recorder = createRecorder();
    const shared = createSharedBrowserLauncher(recorder.launcher);
    await shared.launch({ headless: true });
    await shared.launch({ headless: false });

    await shared.dispose();

    expect(recorder.browserCloses).toBe(2);

    await shared.launch({ headless: true });

    expect(recorder.launches).toHaveLength(3);
  });

  it('disposes without error when nothing was launched', async () => {
    const recorder = createRecorder();

    await createSharedBrowserLauncher(recorder.launcher).dispose();

    expect(recorder.browserCloses).toBe(0);
  });

  it('passes a CDP attach straight through, so the operator browser is never shared or closed', async () => {
    const recorder = createRecorder();
    const shared = createSharedBrowserLauncher(recorder.launcher);

    const attached = await shared.connectOverCdp('http://localhost:9222', { timeoutMs: 1_000 });
    await shared.dispose();

    expect(recorder.cdpEndpoints).toEqual(['http://localhost:9222']);
    expect(recorder.browserCloses).toBe(0);
    expect(attached.contexts()).toEqual([]);
  });
});
