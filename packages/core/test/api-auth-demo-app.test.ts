// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiAuthTokenCache } from '../src/api-auth.js';
import type { EngineContext } from '../src/engine-context.js';
import { runHttpExecute } from '../src/operations/http-execute.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4398;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: out-of-scope, a11y: undecided, security: undecided }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'apiAuth:',
  '  profiles:',
  '    demo:',
  '      type: oauth2-client-credentials',
  `      tokenUrl: "${BASE_URL}oauth/token"`,
  '      clientIdVariable: QA_DEMO_CLIENT_ID',
  '      clientSecretVariable: QA_DEMO_CLIENT_SECRET',
  '',
].join('\n');

async function issuedTokenCount(): Promise<number> {
  const response = await fetch(`${BASE_URL}oauth/issued`);
  return ((await response.json()) as { issued: number }).issued;
}

async function allEvidenceText(projectRoot: string, runId: string): Promise<string> {
  const directory = join(projectRoot, '.qa', 'evidence', runId);
  const names = await readdir(directory);
  const contents = await Promise.all(names.map((name) => readFile(join(directory, name), 'utf-8')));
  return contents.join('\n');
}

// Exercises the OAuth2 client-credentials profile (P6-33) against a real HTTP server, the boundary
// the fake HttpClient in the unit tests cannot cover: a real token request, a real bearer check,
// and a real 401 after the token is revoked server-side.
describe('OAuth2 client-credentials profile (demo app)', () => {
  it('acquires a token, reuses it, refreshes it after a 401 and never stores a secret', async () => {
    await withTempDir(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
      const context: EngineContext = {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: { QA_DEMO_CLIENT_ID: 'demo-client', QA_DEMO_CLIENT_SECRET: 'demo-secret' },
      };
      const authTokenCache = createApiAuthTokenCache();
      const call = () =>
        runHttpExecute(context, {
          runId: 'run-1',
          url: `${BASE_URL}api/whoami`,
          auth: 'demo',
          authTokenCache,
        });
      const issuedBefore = await issuedTokenCount();

      const first = await call();
      const second = await call();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await issuedTokenCount()).toBe(issuedBefore + 1);

      await fetch(`${BASE_URL}oauth/revoke-all`, { method: 'POST' });
      const afterRevocation = await call();
      expect(afterRevocation.status).toBe(200);
      expect(await issuedTokenCount()).toBe(issuedBefore + 2);

      // The demo app echoes the token it accepted; none of it may reach a stored record.
      const evidence = await allEvidenceText(projectRoot, 'run-1');
      // The body preview sits inside a JSON string in the record, so its quotes are escaped.
      expect(evidence).toContain('\\"client\\":\\"demo-client\\"');
      expect(evidence).not.toContain('demo-token');
      expect(evidence).not.toContain('demo-secret');
    });
  });

  it('refuses to send the client secret to a token URL outside the allowlist', async () => {
    await withTempDir(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(
        join(projectRoot, '.qa', 'config.yaml'),
        CONFIG_YAML.replace(`${BASE_URL}oauth/token`, 'http://elsewhere.test:4398/oauth/token'),
        'utf-8',
      );
      const context: EngineContext = {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: { QA_DEMO_CLIENT_ID: 'demo-client', QA_DEMO_CLIENT_SECRET: 'demo-secret' },
      };
      const issuedBefore = await issuedTokenCount();

      const error = await runHttpExecute(context, {
        runId: 'run-1',
        url: `${BASE_URL}api/whoami`,
        auth: 'demo',
      }).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });
      expect(await issuedTokenCount()).toBe(issuedBefore);
    });
  });
});
