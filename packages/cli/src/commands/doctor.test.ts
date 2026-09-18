// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { resolveBrowserExecutablePath, SUPPORTED_BROWSERS, type FileSystem } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { createFakeHttpClient } from '../test-support/fake-http-client.js';
import { createFakeProcessRunner } from '../test-support/fake-process-runner.js';
import { runInit } from './init.js';
import { runDoctor } from './doctor.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };
const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function fakeContext(overrides: Partial<Parameters<typeof createCommandContext>[0]> = {}): CommandContext {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: noopIo,
    fs: createFakeFileSystem(),
    env: {},
    ...overrides,
  });
}

describe('runDoctor', () => {
  it('reports config missing with a remediation when no config.yaml exists', async () => {
    const report = await runDoctor(fakeContext());

    expect(report.ok).toBe(false);
    const configCheck = report.checks.find((check) => check.name === 'config');
    expect(configCheck?.status).toBe('fail');
    expect(configCheck?.remediation).toContain('qa init');
  });

  it('reports a browser as passing when its executable is present', async () => {
    const chromiumPath = resolveBrowserExecutablePath('chromium');
    const context = fakeContext({ fs: createFakeFileSystem({ [chromiumPath]: '' }) });

    const report = await runDoctor(context);

    const chromiumCheck = report.checks.find((check) => check.name === 'browser:chromium');
    expect(chromiumCheck?.status).toBe('pass');
  });

  it('installs missing browsers and rechecks them when fix is set', async () => {
    const context = fakeContext({
      processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    });

    const report = await runDoctor(context, { fix: true });

    expect(report.checks.some((check) => check.name === 'browser-install')).toBe(true);
    // The fake filesystem never gains the executable, so the recheck still reports it missing.
    expect(report.checks.find((check) => check.name === 'browser:chromium')?.status).toBe('fail');
  });

  it('checks identities and environment reachability once a config exists', async () => {
    const fs = createFakeFileSystem();
    const context = fakeContext({
      fs,
      env: { QA_ADMIN_PASSWORD: 'set' },
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    });
    await runInit(context, { deferScope: true });
    await fs.writeFile(
      join(QA_DIR, 'config.yaml'),
      [
        'schemaVersion: 1',
        'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
        'environments:',
        '  staging: { baseUrl: "https://staging.example.com", allowlist: ["staging.example.com"] }',
        'identities:',
        '  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        '',
      ].join('\n'),
    );

    const report = await runDoctor(context);

    expect(report.checks.find((check) => check.name === 'identity:admin')?.status).toBe('pass');
    expect(report.checks.find((check) => check.name === 'environment:staging')?.status).toBe('pass');
  });

  it('does nothing when fix is set and every browser is already installed', async () => {
    const installedFiles = Object.fromEntries(
      SUPPORTED_BROWSERS.map((browser) => [resolveBrowserExecutablePath(browser), '']),
    );
    const context = fakeContext({ fs: createFakeFileSystem(installedFiles) });

    const report = await runDoctor(context, { fix: true });

    expect(report.checks.some((check) => check.name === 'browser-install')).toBe(false);
  });

  it('rethrows a config load failure that is not a QaError', async () => {
    const brokenFs: FileSystem = {
      readFile: () => Promise.reject(new Error('disk exploded')),
      writeFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      pathExists: (path) => Promise.resolve(path.endsWith('config.yaml')),
      listFiles: () => Promise.resolve([]),
    };
    const context = fakeContext({ fs: brokenFs });

    await expect(runDoctor(context)).rejects.toThrow('disk exploded');
  });
});
