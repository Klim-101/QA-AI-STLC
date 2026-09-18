// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError, SUPPORTED_BROWSERS, resolveBrowserExecutablePath, type FileSystem } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { runCli, type RunCliDependencies } from './cli.js';
import { EXIT_FAILURE, EXIT_SUCCESS, EXIT_USAGE } from './exit-codes.js';
import { createFakeExploreBrowserLauncher } from './test-support/fake-browser-launcher.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

const PROJECT_ROOT = join('project');

function captureIO() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) },
    stdout,
    stderr,
  };
}

function dependencies(
  overrides: Partial<RunCliDependencies> = {},
): RunCliDependencies & { stdout: string[]; stderr: string[] } {
  const { io, stdout, stderr } = captureIO();
  return { io, projectRoot: PROJECT_ROOT, fs: createFakeFileSystem(), env: {}, stdout, stderr, ...overrides };
}

describe('runCli', () => {
  it('prints usage and exits with a usage error when no command is given', async () => {
    const deps = dependencies();
    const exitCode = await runCli([], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stdout.join('\n')).toContain('Usage: qa <command>');
  });

  it('prints usage and succeeds for --help', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['--help'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('Usage: qa <command>');
  });

  it('prints a version for --version', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['--version'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports an unknown command as a usage error', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['bogus'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown command "bogus"');
  });

  it('reports an unknown flag as a usage error', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['init', '--not-a-flag'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('error:');
  });

  it('runs init and prints human output on success', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain(`Initialized ${join(PROJECT_ROOT, '.qa')}`);
  });

  it('runs init and prints machine-readable JSON with --json', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['init', '--json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toHaveLength(1);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({ command: 'init', data: { alreadyInitialized: false } });
  });

  it('runs doctor and fails when the config is missing', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['doctor'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.some((line) => line.includes('[FAIL] config'))).toBe(true);
  });

  it('reports nothing-to-do when init runs twice against the same store', async () => {
    const deps = dependencies();
    await runCli(['init'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('already initialized; nothing to do.');
  });

  it('reports a QaError with its remediation and exits with a failure code', async () => {
    const throwingFs: FileSystem = {
      readFile: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      mkdir: () =>
        Promise.reject(
          new QaError('MKDIR_FAILED', 'could not create .qa/', { remediation: 'check permissions' }),
        ),
      pathExists: () => Promise.resolve(false),
      listFiles: () => Promise.resolve([]),
    };
    const deps = dependencies({ fs: throwingFs });

    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('could not create .qa/');
    expect(deps.stderr.join('\n')).toContain('check permissions');
  });

  it('reports a QaError without a remediation', async () => {
    const throwingFs: FileSystem = {
      readFile: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      mkdir: () => Promise.reject(new QaError('MKDIR_FAILED', 'could not create .qa/')),
      pathExists: () => Promise.resolve(false),
      listFiles: () => Promise.resolve([]),
    };
    const deps = dependencies({ fs: throwingFs });

    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toBe('error: could not create .qa/');
  });

  it('reports a non-Error throw as a generic failure', async () => {
    const throwingFs: FileSystem = {
      readFile: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      // Deliberately not an Error: proves `reportError` also handles a non-Error throw, which
      // TypeScript permits even though this project's own code never throws one.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      mkdir: () => Promise.reject('boom'),
      pathExists: () => Promise.resolve(false),
      listFiles: () => Promise.resolve([]),
    };
    const deps = dependencies({ fs: throwingFs });

    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toBe('error: boom');
  });

  it('reports a plain Error as a generic failure', async () => {
    const throwingFs: FileSystem = {
      readFile: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      mkdir: () => Promise.reject(new Error('disk full')),
      pathExists: () => Promise.resolve(false),
      listFiles: () => Promise.resolve([]),
    };
    const deps = dependencies({ fs: throwingFs });

    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toBe('error: disk full');
  });

  it('defaults the project root to the current working directory for init', async () => {
    const { io, stdout } = captureIO();

    const exitCode = await runCli(['init'], { io, fs: createFakeFileSystem(), env: {} });

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(stdout.join('\n')).toContain(join(process.cwd(), '.qa'));
  });

  it('defaults the project root to the current working directory for doctor', async () => {
    const { io, stdout } = captureIO();

    const exitCode = await runCli(['doctor'], { io, fs: createFakeFileSystem(), env: {} });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stdout.some((line) => line.includes('[FAIL] config'))).toBe(true);
  });

  it('runs doctor and succeeds when every check passes', async () => {
    const installed = Object.fromEntries(
      SUPPORTED_BROWSERS.map((browser) => [resolveBrowserExecutablePath(browser), '']),
    );
    const deps = dependencies({ fs: createFakeFileSystem(installed) });
    await runCli(['init'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(['doctor'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  const EXPLORE_CONFIG = [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.com/login", allowlist: ["staging.example.com"] }',
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');

  const EXPLORE_CONFIG_WITH_IDENTITY = [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.com/login", allowlist: ["staging.example.com"] }',
    'identities:',
    '  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');

  function exploreDeps(browserOptions: Parameters<typeof createFakeExploreBrowserLauncher>[0] = {}) {
    const fs = createFakeFileSystem();
    const deps = dependencies({ fs, browserLauncher: createFakeExploreBrowserLauncher(browserOptions) });
    return { fs, deps };
  }

  it('runs explore, writes the registry and prints a human-readable summary', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.some((line) => line.includes('Wrote selectors/registry.json'))).toBe(true);
  });

  it('runs explore --json and prints a single JSON line', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toHaveLength(1);
    const parsed = JSON.parse(deps.stdout[0] ?? '{}') as { command: string };
    expect(parsed.command).toBe('explore');
  });

  it('fails explore --max-pages with a non-numeric value', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--max-pages', 'nope'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
  });

  it('accepts a positive integer --max-pages', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--max-pages', '5'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  it('reports no degraded selectors and exits successfully on --verify when nothing changed', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    await fs.writeFile(
      join(PROJECT_ROOT, '.qa', 'selectors', 'registry.json'),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-09-18T00:00:00Z',
        elements: [
          {
            elementId: 'el-1',
            name: 'logIn',
            kind: 'button',
            locatorCandidates: [{ strategy: 'testId', value: 'login-submit', fragile: false }],
            stabilityScore: 1,
            lastVerifiedAt: '2026-09-18T00:00:00Z',
            pii: false,
            dynamicText: false,
            source: 'crawl',
            pageUrl: 'https://staging.example.com/login',
          },
        ],
      }),
    );
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--verify'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.some((line) => line.includes('No degraded selectors.'))).toBe(true);
  });

  it('defaults the project root to the current working directory for explore', async () => {
    const { io, stdout, stderr } = captureIO();

    const exitCode = await runCli(['explore'], { io, fs: createFakeFileSystem(), env: {} });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stdout.join('\n') + stderr.join('\n')).toContain('config.yaml');
  });

  it('forwards --environment, --identity, --cdp-endpoint, --policy and --pick to runExplore', async () => {
    const { fs, deps } = exploreDeps({
      pickModeState: { done: true, captures: [] },
      locatorCount: 1,
      authStorageState: { cookies: [], origins: [] },
    });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG_WITH_IDENTITY);
    deps.stdout.length = 0;

    const exitCode = await runCli(
      [
        'explore',
        '--environment',
        'staging',
        '--identity',
        'admin',
        '--cdp-endpoint',
        'ws://localhost:9222',
        '--policy',
        'testid-first',
        '--pick',
        'https://staging.example.com/pick',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  it('reports a human-readable degraded selector and exits with a failure code on --verify', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 0 });
    await runCli(['init'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    await fs.writeFile(
      join(PROJECT_ROOT, '.qa', 'selectors', 'registry.json'),
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-09-18T00:00:00Z',
        elements: [
          {
            elementId: 'el-1',
            name: 'logIn',
            kind: 'button',
            locatorCandidates: [{ strategy: 'testId', value: 'login-submit', fragile: false }],
            stabilityScore: 1,
            lastVerifiedAt: '2026-09-18T00:00:00Z',
            pii: false,
            dynamicText: false,
            source: 'crawl',
            pageUrl: 'https://staging.example.com/login',
          },
        ],
      }),
    );
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--verify'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.some((line) => line.includes('degraded selector'))).toBe(true);
    expect(deps.stdout.some((line) => line.includes('el-1: 1 -> 0'))).toBe(true);
  });
});
