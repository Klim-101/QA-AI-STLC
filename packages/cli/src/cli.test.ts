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
    const exitCode = await runCli(['init', '--defer-scope'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain(`Initialized ${join(PROJECT_ROOT, '.qa')}`);
  });

  it('runs init and prints machine-readable JSON with --json', async () => {
    const deps = dependencies();
    const exitCode = await runCli(['init', '--json', '--defer-scope'], deps);

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

  it('answers the testing scope survey with --e2e, --api, --a11y and --security', async () => {
    const deps = dependencies();

    const exitCode = await runCli(
      [
        'init',
        '--e2e',
        'in-scope',
        '--api',
        'out-of-scope',
        '--a11y',
        'out-of-scope',
        '--security',
        'out-of-scope',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  it('fails init with a coded error when a scope flag has an invalid value', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['init', '--e2e', 'sort-of'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('is not valid for --e2e');
  });

  it('accepts --source-path and --api-source, writing both into config.yaml', async () => {
    const deps = dependencies();

    const exitCode = await runCli(
      [
        'init',
        '--e2e',
        'out-of-scope',
        '--api',
        'in-scope',
        '--a11y',
        'out-of-scope',
        '--security',
        'out-of-scope',
        '--source-path',
        'app-src',
        '--api-source',
        'discover',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  it('reports nothing-to-do when init runs twice against the same store', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(['init', '--defer-scope'], deps);

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

    const exitCode = await runCli(['init', '--defer-scope'], deps);

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

    const exitCode = await runCli(['init', '--defer-scope'], deps);

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

    const exitCode = await runCli(['init', '--defer-scope'], deps);

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

    const exitCode = await runCli(['init', '--defer-scope'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toBe('error: disk full');
  });

  it('defaults the project root to the current working directory for init', async () => {
    const { io, stdout } = captureIO();

    const exitCode = await runCli(['init', '--defer-scope'], { io, fs: createFakeFileSystem(), env: {} });

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
    await runCli(['init', '--defer-scope'], deps);
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
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.some((line) => line.includes('Wrote selectors/registry.json'))).toBe(true);
  });

  it('runs explore --json and prints a single JSON line', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
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
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--max-pages', 'nope'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
  });

  it('accepts a positive integer --max-pages', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--max-pages', '5'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  it('reports no degraded selectors and exits successfully on --verify when nothing changed', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
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
    await runCli(['init', '--defer-scope'], deps);
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
    await runCli(['init', '--defer-scope'], deps);
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

  it('runs "config set" and prints a human-readable confirmation', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(['config', 'set', 'testing.e2e', 'in-scope'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Set testing.e2e = in-scope');
  });

  it('runs "config set" and prints machine-readable JSON with --json', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(['config', 'set', 'testing.e2e', 'in-scope', '--json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toHaveLength(1);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({ command: 'config-set', data: { key: 'testing.e2e', value: 'in-scope' } });
  });

  it('reports a usage error for an unknown "config" subcommand', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config', 'bogus'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa config" subcommand "bogus"');
  });

  it('reports a usage error when "config" is given no subcommand at all', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa config" subcommand ""');
  });

  it('reports a coded error when "config set" is given no key or value', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config', 'set'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa config set <key> <value>');
  });

  it('defaults the project root to the current working directory for "config set"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['config', 'set', 'testing.e2e', 'in-scope'], {
      io,
      fs: createFakeFileSystem(),
      env: {},
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('config.yaml');
  });

  it('runs "config add environment" and prints a human-readable confirmation', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(
      [
        'config',
        'add',
        'environment',
        'staging',
        '--base-url',
        'https://staging.example.com',
        '--allowlist',
        'staging.example.com, other.example.com',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain(
      'Added environment "staging": https://staging.example.com (allowlist: staging.example.com, other.example.com)',
    );
  });

  it('runs "config add environment" and prints machine-readable JSON with --json', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(
      [
        'config',
        'add',
        'environment',
        'staging',
        '--base-url',
        'https://staging.example.com',
        '--allowlist',
        'staging.example.com',
        '--json',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({
      command: 'config-add-environment',
      data: { name: 'staging', environment: { baseUrl: 'https://staging.example.com' } },
    });
  });

  it('reports a coded error when "config add environment" is missing required flags', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config', 'add', 'environment', 'staging'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa config add environment');
  });

  it('runs "config add identity" and prints a human-readable confirmation', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(
      [
        'config',
        'add',
        'identity',
        'admin',
        '--auth',
        'storage-state',
        '--secret',
        'QA_ADMIN_PASSWORD',
        '--login-url',
        'https://staging.example.com/login',
        '--username',
        'admin@example.com',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Added identity "admin": auth=storage-state, secret=QA_ADMIN_PASSWORD');
  });

  it('runs "config add identity" and prints machine-readable JSON with --json', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(
      [
        'config',
        'add',
        'identity',
        'admin',
        '--auth',
        'cdp-attach',
        '--secret',
        'QA_ADMIN_PASSWORD',
        '--json',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({
      command: 'config-add-identity',
      data: { name: 'admin', identity: { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' } },
    });
  });

  it('reports a coded error when "config add identity" is missing required flags', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config', 'add', 'identity', 'admin'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa config add identity');
  });

  it('reports a coded error when "config add identity" fails schema validation', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stdout.length = 0;

    const exitCode = await runCli(
      ['config', 'add', 'identity', 'admin', '--auth', 'storage-state', '--secret', 'QA_ADMIN_PASSWORD'],
      deps,
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('error:');
  });

  it('reports a usage error for an unknown "config add" target', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config', 'add', 'bogus'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa config add" target "bogus"');
  });

  it('reports a usage error when "config add" is given no target at all', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['config', 'add'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa config add" target ""');
  });

  it('defaults the project root to the current working directory for "config add environment"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(
      ['config', 'add', 'environment', 'staging', '--base-url', 'https://a.example.com', '--allowlist', 'a'],
      { io, fs: createFakeFileSystem(), env: {} },
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('config.yaml');
  });

  it('defaults the project root to the current working directory for "config add identity"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(
      ['config', 'add', 'identity', 'admin', '--auth', 'cdp-attach', '--secret', 'QA_ADMIN_PASSWORD'],
      { io, fs: createFakeFileSystem(), env: {} },
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('config.yaml');
  });
});
