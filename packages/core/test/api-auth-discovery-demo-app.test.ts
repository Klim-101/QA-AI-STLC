// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import { runBrowserDiscoverApiAuth } from '../src/operations/browser-discover-api-auth.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runConfigAddApiAuthProfile } from '../src/operations/config-add-api-auth.js';
import { runHttpExecute } from '../src/operations/http-execute.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4424;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;
const TOKEN_PATTERN = /demo-token-\d+/u;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

// No `apiAuth` section: the profile is created through the tools, not written by hand.
const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: out-of-scope, a11y: undecided, security: undecided }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

describe('API auth discovery (demo app)', () => {
  it('finds where the page keeps its token, creates the profile and authenticates a call with it', async () => {
    await withTempDir(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
      const engine: EngineContext = {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: {},
      };
      const sessions = new BrowserSessionStore();
      const browserContext = { engine, sessions };
      const { sessionId } = await runBrowserOpen(browserContext);

      try {
        await runBrowserNavigate(browserContext, { sessionId, url: `${BASE_URL}token-demo.html` });
        const session = await sessions.get(sessionId);
        await session.page.waitForLoadState('networkidle');

        const discovery = await runBrowserDiscoverApiAuth(browserContext, { sessionId });

        expect(discovery.tokenHeader).toBe('authorization');
        expect(discovery.sources).toEqual(
          expect.arrayContaining([
            { kind: 'cookie', name: 'api_token' },
            { kind: 'local-storage', key: 'auth', jsonPath: 'token.access' },
            { kind: 'session-storage', key: 'sessionToken' },
            { kind: 'request-header', header: 'authorization' },
          ]),
        );
        expect(JSON.stringify(discovery)).not.toMatch(TOKEN_PATTERN);

        await runConfigAddApiAuthProfile(engine, {
          name: 'discovered',
          profile: discovery.proposedProfile,
          defaultForEnvironment: 'staging',
        });
        const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');
        expect(config).toContain('discovered');
        expect(config).not.toMatch(TOKEN_PATTERN);

        const named = await runHttpExecute(engine, {
          runId: 'run-http',
          url: `${BASE_URL}api/whoami`,
          auth: 'discovered',
          browserSessionId: sessionId,
          sessions,
        });
        const byDefault = await runHttpExecute(engine, {
          runId: 'run-http',
          url: `${BASE_URL}api/whoami`,
          browserSessionId: sessionId,
          sessions,
        });

        expect(named.status).toBe(200);
        expect(byDefault.status).toBe(200);
        expect(JSON.stringify([named, byDefault])).not.toMatch(TOKEN_PATTERN);
      } finally {
        await sessions.closeAll();
      }
    });
  }, 120_000);

  it('asks to sign in when the page has not called the API yet', async () => {
    await withTempDir(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
      const engine: EngineContext = {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: {},
      };
      const sessions = new BrowserSessionStore();
      const browserContext = { engine, sessions };
      const { sessionId } = await runBrowserOpen(browserContext);

      try {
        await expect(runBrowserDiscoverApiAuth(browserContext, { sessionId })).rejects.toMatchObject({
          code: 'API_AUTH_DISCOVERY_NO_TOKEN',
        });
      } finally {
        await sessions.closeAll();
      }
    });
  }, 120_000);
});
