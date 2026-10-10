// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashBytes } from '../src/hash.js';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserUpload } from '../src/operations/browser-upload.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4416;
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
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"], actionTimeoutMs: 5000 }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

const FIXTURE_BYTES = new TextEncoder().encode('first,second\n1,2\n');

async function withContext(
  run: (context: BrowserOperationContext, sessionId: string, outsideDirectory: string) => Promise<void>,
): Promise<void> {
  await withTempDir(async (outsideDirectory) => {
    await withTempDir(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await mkdir(join(projectRoot, 'fixtures'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
      await writeFile(join(projectRoot, 'fixtures', 'rows.csv'), FIXTURE_BYTES);
      await writeFile(
        join(projectRoot, 'fixtures', 'creds.txt'),
        'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123',
        'utf-8',
      );
      const engine: EngineContext = {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: process.env,
      };
      const sessions = new BrowserSessionStore();
      const context: BrowserOperationContext = { engine, sessions };
      try {
        const { sessionId } = await runBrowserOpen(context, { environment: 'staging' });
        await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}login` });
        const session = await sessions.get(sessionId);
        await session.page.evaluate(addFileInputs);
        await run(context, sessionId, outsideDirectory);
      } finally {
        await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
      }
    });
  });
}

interface FixtureNode {
  id: string;
  type: string;
  multiple: boolean;
  append(node: FixtureNode): void;
}

interface FixturePage {
  document: {
    createElement(tag: string): FixtureNode;
    querySelector(selector: string): FixtureNode | null;
  };
}

// Runs inside the page, where nothing from this module exists.
function addFileInputs(): void {
  const { document } = globalThis as unknown as FixturePage;
  for (const [id, multiple] of [
    ['one', false],
    ['many', true],
  ] as const) {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'file';
    input.multiple = multiple;
    document.querySelector('main')?.append(input);
  }
}

describe('qa.browser_upload on the demo app', () => {
  it('uploads a fixture, the page holds it, and the record has name, size and hash only', async () => {
    await withContext(async (context, sessionId) => {
      const result = await runBrowserUpload(context, {
        sessionId,
        selector: '#one',
        paths: ['fixtures/rows.csv'],
        stepId: 'step-2',
      });

      const files = [
        { name: 'rows.csv', sizeBytes: FIXTURE_BYTES.byteLength, sha256: hashBytes(FIXTURE_BYTES) },
      ];
      expect(result.files).toEqual(files);
      const record = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', result.evidence.path), 'utf-8'),
      ) as unknown;
      expect(record).toMatchObject({ type: 'upload', stepId: 'step-2', selector: '#one', files });
      expect(JSON.stringify(record)).not.toContain('first,second');
    });
  }, 30_000);

  it('uploads several files to a multiple input, in order', async () => {
    await withContext(async (context, sessionId) => {
      const result = await runBrowserUpload(context, {
        sessionId,
        selector: '#many',
        paths: ['fixtures/rows.csv', 'fixtures/rows.csv'],
      });

      expect(result.files.map((file) => file.name)).toEqual(['rows.csv', 'rows.csv']);
    });
  }, 30_000);

  it('refuses a path outside the project, a symbolic link out of it, a missing file and a secret', async () => {
    await withContext(async (context, sessionId, outsideDirectory) => {
      const upload = (path: string) =>
        runBrowserUpload(context, { sessionId, selector: '#one', paths: [path] }).catch(
          (caught: unknown) => caught,
        );
      await writeFile(join(outsideDirectory, 'outside.csv'), 'a,b\n', 'utf-8');
      let linked = true;
      try {
        await symlink(
          join(outsideDirectory, 'outside.csv'),
          join(context.engine.projectRoot, 'fixtures', 'link.csv'),
        );
      } catch {
        // Creating a symbolic link needs a privilege on some Windows setups; the rest still runs.
        linked = false;
      }

      expect(await upload('../outside.csv')).toMatchObject({ code: 'BROWSER_UPLOAD_PATH_INVALID' });
      expect(await upload(join(outsideDirectory, 'outside.csv').replaceAll('\\', '/'))).toMatchObject({
        code: 'BROWSER_UPLOAD_PATH_INVALID',
      });
      if (linked) {
        expect(await upload('fixtures/link.csv')).toMatchObject({ code: 'BROWSER_UPLOAD_PATH_INVALID' });
      }
      expect(await upload('fixtures/missing.csv')).toMatchObject({ code: 'BROWSER_UPLOAD_FILE_MISSING' });
      expect(await upload('fixtures/creds.txt')).toMatchObject({ code: 'BROWSER_UPLOAD_SECRET' });
    });
  }, 30_000);
});
