// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  ManifestStore,
  QaError,
  QaStore,
  SUPPORTED_BROWSERS,
  hashText,
  resolveBrowserExecutablePath,
  type FileSystem,
} from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { runCli, type RunCliDependencies } from './cli.js';
import { EXIT_FAILURE, EXIT_SUCCESS, EXIT_USAGE } from './exit-codes.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeExploreBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';

const PROJECT_ROOT = join('project');

// Every type decided (P2-16 blocks "qa scope"/"qa cases add" while any is "undecided"); e2e
// in-scope since every case fixture in this file is testType "e2e".
const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');
const CONFIG_PATH = join(PROJECT_ROOT, '.qa', 'config.yaml');

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

function runRecordJson(id: string, startedAt: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    testType: 'e2e',
    specFiles: ['tests/login.playwright-spec.ts'],
    baseUrl: 'https://staging.example.test/',
    startedAt,
    finishedAt: '2026-09-25T10:00:05.000Z',
    resultIds: [],
    counts: { passed: 0, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
  });
}

/** A `.qa/manifest.json` registering each of `contentByPath`'s entries under its own hash (P2-07). */
function manifestRegistering(contentByPath: Readonly<Record<string, string>>): string {
  return JSON.stringify({
    schemaVersion: 1,
    artifacts: Object.fromEntries(
      Object.entries(contentByPath).map(([path, content]) => [
        path,
        { sha256: hashText(content), mode: 'text', registeredAt: '2026-09-20T12:00:00Z' },
      ]),
    ),
  });
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

  describe('accessibility target flags (P6-25)', () => {
    const SCOPE = ['--e2e', 'out-of-scope', '--api', 'out-of-scope', '--security', 'out-of-scope'];

    it('records the default WCAG 2.1 AA target when --a11y is in-scope and no target flag is given', async () => {
      const deps = dependencies();

      const exitCode = await runCli(['init', ...SCOPE, '--a11y', 'in-scope'], deps);
      const config = await deps.fs?.readFile(CONFIG_PATH);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(config).toContain('wcagVersion: "2.1"');
      expect(config).toContain('level: AA');
      expect(config).toContain('bestPractices: false');
    });

    it('records --a11y-wcag-version, --a11y-level and --a11y-best-practices', async () => {
      const deps = dependencies();

      const exitCode = await runCli(
        [
          'init',
          ...SCOPE,
          '--a11y',
          'in-scope',
          '--a11y-wcag-version',
          '2.2',
          '--a11y-level',
          'AAA',
          '--a11y-best-practices',
        ],
        deps,
      );
      const config = await deps.fs?.readFile(CONFIG_PATH);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(config).toContain('wcagVersion: "2.2"');
      expect(config).toContain('level: AAA');
      expect(config).toContain('bestPractices: true');
    });

    it.each([
      ['--a11y-wcag-version', '3.0'],
      ['--a11y-level', 'AAAA'],
    ])('fails init with a coded error when %s is %s', async (flag, value) => {
      const deps = dependencies();

      const exitCode = await runCli(['init', ...SCOPE, '--a11y', 'in-scope', flag, value], deps);

      expect(exitCode).toBe(EXIT_FAILURE);
      expect(deps.stderr).toContain(`error: "${value}" is not valid for ${flag}`);
    });

    it('refuses a target when --a11y is not in-scope', async () => {
      const deps = dependencies();

      const exitCode = await runCli(['init', ...SCOPE, '--a11y', 'out-of-scope', '--a11y-level', 'AA'], deps);

      expect(exitCode).toBe(EXIT_FAILURE);
      expect(deps.stderr).toContain(
        'error: An accessibility target was given but a11y testing is not in-scope',
      );
    });
  });

  describe('component library flag (P6-36)', () => {
    const SCOPE = [
      '--e2e',
      'out-of-scope',
      '--api',
      'out-of-scope',
      '--a11y',
      'out-of-scope',
      '--security',
      'out-of-scope',
    ];

    it.each(['none', 'kendo-jquery', 'kendo-angular'] as const)(
      'records --component-library %s',
      async (library) => {
        const deps = dependencies();

        const exitCode = await runCli(['init', ...SCOPE, '--component-library', library], deps);

        expect(exitCode).toBe(EXIT_SUCCESS);
        expect(await deps.fs?.readFile(CONFIG_PATH)).toContain(`componentLibrary: ${library}`);
      },
    );

    it('fails init with a coded error for an unknown library', async () => {
      const deps = dependencies();

      const exitCode = await runCli(['init', ...SCOPE, '--component-library', 'kendo-react'], deps);

      expect(exitCode).toBe(EXIT_FAILURE);
      expect(deps.stderr).toContain('error: "kendo-react" is not valid for --component-library');
    });

    it.each(['none', 'kendo-jquery', 'kendo-angular'] as const)(
      '"config set ui.componentLibrary %s" updates the config',
      async (library) => {
        const deps = dependencies();
        await runCli(['init', '--defer-scope'], deps);
        deps.stdout.length = 0;

        const exitCode = await runCli(['config', 'set', 'ui.componentLibrary', library], deps);

        expect(exitCode).toBe(EXIT_SUCCESS);
        expect(deps.stdout).toContain(`Set ui.componentLibrary = ${library}`);
        expect(await deps.fs?.readFile(CONFIG_PATH)).toContain(`componentLibrary: ${library}`);
      },
    );
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
      readBytes: () => Promise.reject(new Error('unused')),
      realPath: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      deleteFile: () => Promise.resolve(),
      createExclusive: () => Promise.resolve(true),
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
      readBytes: () => Promise.reject(new Error('unused')),
      realPath: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      deleteFile: () => Promise.resolve(),
      createExclusive: () => Promise.resolve(true),
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
      readBytes: () => Promise.reject(new Error('unused')),
      realPath: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      deleteFile: () => Promise.resolve(),
      createExclusive: () => Promise.resolve(true),
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
      readBytes: () => Promise.reject(new Error('unused')),
      realPath: () => Promise.reject(new Error('unused')),
      writeFile: () => Promise.resolve(),
      deleteFile: () => Promise.resolve(),
      createExclusive: () => Promise.resolve(true),
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

  it('prints every relaxation the local configuration layer introduces (P6-24)', async () => {
    const installed = Object.fromEntries(
      SUPPORTED_BROWSERS.map((browser) => [resolveBrowserExecutablePath(browser), '']),
    );
    const localYaml = [
      'environments:',
      '  dev:',
      '    baseUrl: http://localhost:4310',
      '    allowlist: [localhost]',
      '',
    ].join('\n');
    const deps = dependencies({
      fs: createFakeFileSystem({
        ...installed,
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'config.local.yaml')]: localYaml,
      }),
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    });

    const exitCode = await runCli(['doctor'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(
      deps.stdout.some((line) => line.includes('adds "localhost"') && line.includes('.qa/config.local.yaml')),
    ).toBe(true);
  });

  it('prints no relaxation lines with no local configuration layer', async () => {
    const installed = Object.fromEntries(
      SUPPORTED_BROWSERS.map((browser) => [resolveBrowserExecutablePath(browser), '']),
    );
    const deps = dependencies({ fs: createFakeFileSystem({ ...installed, [CONFIG_PATH]: CONFIG_YAML }) });

    await runCli(['doctor'], deps);

    expect(deps.stdout.some((line) => line.includes('adds "') || line.includes('disables TLS'))).toBe(false);
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

  it('lists what the environment let through and what safe mode blocked, by method and path (ADR-0014)', async () => {
    const { fs, deps } = exploreDeps({
      locatorCount: 1,
      subRequestsByUrl: {
        'https://staging.example.com/login': [
          { method: 'POST', url: 'https://staging.example.com/auth/refresh-token' },
          { method: 'POST', url: 'https://staging.example.com/orders' },
        ],
      },
    });
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(
      join(PROJECT_ROOT, '.qa', 'config.yaml'),
      EXPLORE_CONFIG.replace(
        'allowlist: ["staging.example.com"]',
        'allowlist: ["staging.example.com"], safeNonGetRequests: [{ method: POST, path: /auth/refresh-token, reason: "Exchanges the refresh cookie." }]',
      ),
    );
    deps.stdout.length = 0;

    await runCli(['explore'], deps);

    const output = deps.stdout.join('\n');
    expect(output).toContain('Let through by the environment (safeNonGetRequests):');
    expect(output).toMatch(/ {2}POST \/auth\/refresh-token x\d+/u);
    expect(output).toContain(
      'Blocked (an application that stalls may need one listed in safeNonGetRequests):',
    );
    expect(output).toMatch(/ {2}POST \/orders x\d+/u);
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

  it('accepts a repeatable --url and crawls those pages too (P6-77)', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--url', '/a', '--url', '/b'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
  });

  it('reports the controls clicked by explore --probe-navigation, and says nothing without the flag (P6-78)', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);

    deps.stdout.length = 0;
    const withoutFlag = await runCli(['explore'], deps);
    const outputWithoutFlag = deps.stdout.join('\n');
    deps.stdout.length = 0;
    const withFlag = await runCli(['explore', '--probe-navigation'], deps);

    expect(withoutFlag).toBe(EXIT_SUCCESS);
    expect(withFlag).toBe(EXIT_SUCCESS);
    expect(outputWithoutFlag).not.toContain('navigation control(s)');
    expect(deps.stdout.join('\n')).toContain('0 navigation control(s) clicked in isolated contexts.');
  });

  it('reports the collapsed panels opened by explore --expand-collapsed, and says nothing without the flag (P6-98)', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);

    deps.stdout.length = 0;
    const withoutFlag = await runCli(['explore'], deps);
    const outputWithoutFlag = deps.stdout.join('\n');
    deps.stdout.length = 0;
    const withFlag = await runCli(['explore', '--expand-collapsed'], deps);

    expect(withoutFlag).toBe(EXIT_SUCCESS);
    expect(withFlag).toBe(EXIT_SUCCESS);
    expect(outputWithoutFlag).not.toContain('collapsed panel(s)');
    expect(deps.stdout.join('\n')).toContain('0 collapsed panel(s) opened in isolated contexts.');
  });

  it('fails explore --url for a page off the environment allowlist (P6-77)', async () => {
    const { fs, deps } = exploreDeps({ locatorCount: 1 });
    await runCli(['init', '--defer-scope'], deps);
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), EXPLORE_CONFIG);
    deps.stdout.length = 0;

    const exitCode = await runCli(['explore', '--url', 'https://evil.example.com/'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
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

  describe('"api-diff" (P6-02)', () => {
    const API_DIFF_CONFIG = `${EXPLORE_CONFIG}api: { contract: openapi, source: openapi.json }\n`;
    const SPEC = JSON.stringify({ openapi: '3.0.3', paths: { '/tasks/{taskId}': { get: {} } } });
    const ENDPOINTS = JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-30T11:00:00Z',
      endpoints: [{ method: 'GET', path: '/tasks/{id}', source: 'discovered' }],
    });

    async function apiDiffDeps() {
      const fs = createFakeFileSystem();
      const deps = dependencies({ fs });
      await runCli(['init', '--defer-scope'], deps);
      await fs.writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), API_DIFF_CONFIG);
      await fs.writeFile(join(PROJECT_ROOT, 'openapi.json'), SPEC);
      await fs.mkdir(join(PROJECT_ROOT, '.qa', 'selectors'));
      await fs.writeFile(join(PROJECT_ROOT, '.qa', 'selectors', 'endpoints.json'), ENDPOINTS);
      deps.stdout.length = 0;
      return { fs, deps };
    }

    it('writes the diff report and prints a human-readable summary', async () => {
      const { deps } = await apiDiffDeps();

      const exitCode = await runCli(['api-diff', '--environment', 'staging'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout.some((line) => line.includes('Wrote selectors/api-diff.json'))).toBe(true);
      expect(deps.stdout.some((line) => line.includes('1 matched, 0 undocumented'))).toBe(true);
    });

    it('prints a single JSON line with --json', async () => {
      const { deps } = await apiDiffDeps();

      const exitCode = await runCli(['api-diff', '--json'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout).toHaveLength(1);
      expect((JSON.parse(deps.stdout[0] ?? '{}') as { command: string }).command).toBe('api-diff');
    });

    it('defaults the project root to the current working directory', async () => {
      const { io, stdout, stderr } = captureIO();

      const exitCode = await runCli(['api-diff'], { io, fs: createFakeFileSystem(), env: {} });

      expect(exitCode).toBe(EXIT_FAILURE);
      expect(`${stdout.join('\n')}${stderr.join('\n')}`).toContain('config.yaml');
    });
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

  it('turns API testing on after init with --api-source, and refuses without it (#632)', async () => {
    const deps = dependencies();
    await runCli(['init', '--defer-scope'], deps);
    deps.stderr.length = 0;

    const withoutSource = await runCli(['config', 'set', 'testing.api', 'in-scope'], deps);
    const withSource = await runCli(
      ['config', 'set', 'testing.api', 'in-scope', '--api-source', 'discover'],
      deps,
    );

    expect(withoutSource).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('--api-source');
    expect(withSource).toBe(EXIT_SUCCESS);
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

  describe('config add api-auth (P6-93)', () => {
    const PROFILE = '{"type":"bearer","tokenVariable":"QA_API_TOKEN"}';
    const initialised = async () => {
      const deps = dependencies();
      await runCli(['init', '--defer-scope'], deps);
      await runCli(
        [
          'config',
          'add',
          'environment',
          'staging',
          '--base-url',
          'https://staging.example.com',
          '--allowlist',
          'staging.example.com',
        ],
        deps,
      );
      deps.stdout.length = 0;
      return deps;
    };

    it('adds a profile and its environment default, and says so', async () => {
      const deps = await initialised();

      const exitCode = await runCli(
        ['config', 'add', 'api-auth', 'staging-api', '--profile', PROFILE, '--default-for', 'staging'],
        deps,
      );

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout).toContain(
        'Added API auth profile "staging-api": type=bearer, default for "staging"',
      );
    });

    it('adds a profile without a default and prints machine-readable JSON with --json', async () => {
      const deps = await initialised();

      const exitCode = await runCli(
        ['config', 'add', 'api-auth', 'service', '--profile', PROFILE, '--json'],
        deps,
      );

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(JSON.parse(deps.stdout[0] ?? '')).toMatchObject({
        command: 'config-add-api-auth',
        data: { name: 'service', profile: { type: 'bearer', tokenVariable: 'QA_API_TOKEN' } },
      });
    });

    it('overwrites an existing profile with --force', async () => {
      const deps = await initialised();
      await runCli(['config', 'add', 'api-auth', 'service', '--profile', PROFILE], deps);

      const refused = await runCli(['config', 'add', 'api-auth', 'service', '--profile', PROFILE], deps);
      const forced = await runCli(
        ['config', 'add', 'api-auth', 'service', '--profile', PROFILE, '--force'],
        deps,
      );

      expect(refused).toBe(EXIT_FAILURE);
      expect(forced).toBe(EXIT_SUCCESS);
    });

    it('defaults the project root to the current working directory', async () => {
      const { io, stdout } = captureIO();
      const exitCode = await runCli(['config', 'add', 'api-auth', 'service', '--profile', PROFILE], {
        io,
        fs: createFakeFileSystem({ [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG_YAML }),
        env: {},
      });

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(stdout.join('\n')).toContain('Added API auth profile "service"');
    });

    it('reports a coded error for missing flags, invalid JSON and a literal secret', async () => {
      const deps = await initialised();

      const missing = await runCli(['config', 'add', 'api-auth', 'service'], deps);
      const notJson = await runCli(['config', 'add', 'api-auth', 'service', '--profile', '{nope'], deps);
      const literal = await runCli(
        [
          'config',
          'add',
          'api-auth',
          'service',
          '--profile',
          '{"type":"bearer","tokenVariable":"abc.def.ghi"}',
        ],
        deps,
      );

      expect([missing, notJson, literal]).toEqual([EXIT_FAILURE, EXIT_FAILURE, EXIT_FAILURE]);
      const errors = deps.stderr.join('\n');
      expect(errors).toContain('Usage: qa config add api-auth');
      expect(errors).toContain('--profile is not valid JSON');
      expect(errors).toContain('The apiAuth profile is not valid');
    });
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

  it('adds an environment with the safe non-GET requests it is told to allow (ADR-0014)', async () => {
    const fs = createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML });
    const deps = dependencies({ fs });

    const exitCode = await runCli(
      [
        'config',
        'add',
        'environment',
        'qa',
        '--base-url',
        'https://qa.example.com',
        '--allowlist',
        'qa.example.com',
        '--allow-request',
        'POST /auth/refresh-token',
        '--allow-request',
        'POST   /api/search',
        '--allow-request-reason',
        'Exchanges the refresh cookie and reads data.',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const written = await fs.readFile(CONFIG_PATH);
    expect(written).toContain('/auth/refresh-token');
    expect(written).toContain('/api/search');
    expect(written).toContain('Exchanges the refresh cookie and reads data.');
  });

  it('refuses --allow-request without a reason', async () => {
    const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    const exitCode = await runCli(
      [
        'config',
        'add',
        'environment',
        'qa',
        '--base-url',
        'https://qa.example.com',
        '--allowlist',
        'qa.example.com',
        '--allow-request',
        'POST /auth/refresh-token',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('--allow-request needs --allow-request-reason');
  });

  it('refuses a method other than POST in --allow-request', async () => {
    const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    const exitCode = await runCli(
      [
        'config',
        'add',
        'environment',
        'qa',
        '--base-url',
        'https://qa.example.com',
        '--allowlist',
        'qa.example.com',
        '--allow-request',
        'DELETE /api/orders/1',
        '--allow-request-reason',
        'Removes an order, which it must not.',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Invalid input: expected "POST"');
  });

  it('prints a safe non-GET request only the local layer names as a relaxation', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'config.local.yaml')]: [
          'environments:',
          '  staging:',
          '    baseUrl: https://staging.example.com',
          '    allowlist: [staging.example.com]',
          '    safeNonGetRequests:',
          '      - { method: POST, path: /auth/refresh-token, reason: Exchanges the refresh cookie. }',
          '',
        ].join('\n'),
      }),
    });

    await runCli(['validate', '--json'], deps);

    expect(deps.stderr).toContain(
      'warning: CONFIG_RELAXATION .qa/config.local.yaml lets safe mode send POST /auth/refresh-token for environment "staging" (Exchanges the refresh cookie.), which .qa/config.yaml does not list',
    );
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

  it('runs "scope --from file" and prints a human-readable confirmation', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, 'requirements.md')]: '## Login\nbody\n',
      }),
    });

    const exitCode = await runCli(['scope', '--from', 'file', '--path', 'requirements.md'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Wrote artifacts/scope.json: 1 requirement(s) (1 added, 0 updated).');
  });

  it('runs "scope --from text" and prints machine-readable JSON with --json', async () => {
    const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    const exitCode = await runCli(
      ['scope', '--from', 'text', '--content', '## Signup\nbody\n', '--label', 'operator input', '--json'],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({
      command: 'scope',
      data: { scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 },
    });
  });

  it('reports a coded error when "scope" is given no --from', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['scope'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa scope');
  });

  it('reports a coded error when "scope --from" is an unknown value', async () => {
    const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    const exitCode = await runCli(['scope', '--from', 'screenshot'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('is not a valid --from value');
  });

  it('defaults the project root to the current working directory for "scope"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['scope', '--from', 'file', '--path', 'requirements.md'], {
      io,
      fs: createFakeFileSystem({ [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG_YAML }),
      env: {},
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('requirements.md');
  });

  it('runs "approve" and prints a human-readable confirmation', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: '{}',
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({ 'artifacts/scope.json': '{}' }),
      }),
    });

    const exitCode = await runCli(
      ['approve', 'scope', '--artifact', 'artifacts/scope.json', '--approved-by', 'operator'],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Approved "scope": satisfied.');
    expect(deps.stdout).toContain('Current phase: cases.');
  });

  it('runs "approve" and prints machine-readable JSON with --json', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: '{}',
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({ 'artifacts/scope.json': '{}' }),
      }),
    });

    const exitCode = await runCli(
      ['approve', 'scope', '--artifact', 'artifacts/scope.json', '--approved-by', 'operator', '--json'],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({
      command: 'approve',
      data: { gate: 'scope', state: { currentPhase: 'cases' } },
    });
  });

  it('forwards --note to runApprove', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: '{}',
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({ 'artifacts/scope.json': '{}' }),
      }),
    });

    const exitCode = await runCli(
      [
        'approve',
        'scope',
        '--artifact',
        'artifacts/scope.json',
        '--approved-by',
        'operator',
        '--note',
        'looks complete',
        '--json',
      ],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({ command: 'approve', data: { gate: 'scope' } });
  });

  it('reports a coded error when "approve" is missing required flags', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['approve', 'scope'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa approve');
  });

  it('reports a coded error when "approve" targets an unknown gate', async () => {
    const deps = dependencies();

    const exitCode = await runCli(
      ['approve', 'run', '--artifact', 'artifacts/run.json', '--approved-by', 'operator'],
      deps,
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('is not a known gate');
  });

  it('defaults the project root to the current working directory for "approve"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(
      ['approve', 'scope', '--artifact', 'artifacts/scope.json', '--approved-by', 'operator'],
      { io, fs: createFakeFileSystem(), env: {} },
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('artifacts/scope.json');
  });

  describe('triage add', () => {
    const CONFIG = [
      'schemaVersion: 1',
      'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
      'environments:',
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n');
    const RESULT = JSON.stringify({
      schemaVersion: 1,
      id: 'r1',
      runId: 'run-1',
      testCaseId: 'login',
      testType: 'e2e',
      status: 'failed',
      startedAt: '2026-10-10T10:00:00Z',
      finishedAt: '2026-10-10T10:00:01Z',
      evidenceIds: [],
      failure: { message: 'Timeout' },
    });
    const TRIAGE = JSON.stringify({
      schemaVersion: 1,
      runId: 'run-1',
      entries: [
        {
          resultId: 'r1',
          testCaseId: 'login',
          category: 'uncertain',
          confidence: 'low',
          reasons: ['Nothing places it.'],
        },
      ],
      createdAt: '2026-10-17T09:00:00Z',
    });

    function projectFiles(root: string = PROJECT_ROOT): Record<string, string> {
      return {
        [join(root, '.qa', 'config.yaml')]: CONFIG,
        [join(root, '.qa', 'runs', 'run-1', 'results', 'r1.json')]: RESULT,
        [join(root, 'triage.json')]: TRIAGE,
      };
    }

    it('registers the classification and says what it registered', async () => {
      const deps = dependencies({ fs: createFakeFileSystem(projectFiles()) });

      const exitCode = await runCli(['triage', 'add', '--path', 'triage.json'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout).toContain('Registered artifacts/triage/run-1.json (1 classified failure(s)).');
    });

    it('prints machine-readable JSON with --json', async () => {
      const deps = dependencies({ fs: createFakeFileSystem(projectFiles()) });

      await runCli(['triage', 'add', '--path', 'triage.json', '--json'], deps);

      expect(JSON.parse(deps.stdout.join('')) as unknown).toMatchObject({
        command: 'triage-add',
        data: { runId: 'run-1', entryCount: 1 },
      });
    });

    it('defaults the project root to the current working directory', async () => {
      const { io } = captureIO();
      const fs = createFakeFileSystem(projectFiles(process.cwd()));

      expect(await runCli(['triage', 'add', '--path', 'triage.json'], { io, fs, env: {} })).toBe(
        EXIT_SUCCESS,
      );
    });

    it('asks for a path when none is given', async () => {
      const deps = dependencies({ fs: createFakeFileSystem(projectFiles()) });

      expect(await runCli(['triage', 'add'], deps)).toBe(EXIT_FAILURE);
      expect(deps.stderr.join('\n')).toContain('Usage: qa triage add --path <path>');
    });

    it('rejects a missing or unknown subcommand', async () => {
      const deps = dependencies();

      expect(await runCli(['triage', 'sync'], deps)).toBe(EXIT_USAGE);
      expect(await runCli(['triage'], deps)).toBe(EXIT_USAGE);
      expect(deps.stderr.join('\n')).toContain('Unknown "qa triage" subcommand "sync"');
    });
  });

  describe('review add', () => {
    const SPEC = [
      "test('login', { annotation: { type: 'testCaseId', description: 'login' } }, async ({ page }) => {",
      "  await test.step('[step-1] Open', async () => {",
      '    await expect(page).toHaveTitle("Log in");',
      '  });',
      '});',
      '',
    ].join('\n');
    const CASE = JSON.stringify({
      id: 'login',
      feature: 'auth',
      requirementIds: ['r'],
      testType: 'e2e',
      title: 'Log in',
      steps: [{ description: 'Open' }],
      expectedResult: 'Log in',
      status: 'approved',
      createdAt: '2026-10-01T09:00:00Z',
    });
    const CONFIG = [
      'schemaVersion: 1',
      'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
      'environments:',
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n');

    function reviewJson(): string {
      return JSON.stringify({
        schemaVersion: 1,
        testCaseId: 'login',
        specPath: 'tests/login.spec.ts',
        specSha256: hashText(SPEC),
        verdict: 'approved',
        reasons: ['It checks the title the case names.'],
        createdAt: '2026-10-17T09:00:00Z',
      });
    }

    async function projectFs(root: string = PROJECT_ROOT): Promise<ReturnType<typeof createFakeFileSystem>> {
      const fs = createFakeFileSystem({
        [join(root, '.qa', 'config.yaml')]: CONFIG,
        [join(root, '.qa', 'artifacts', 'cases', 'auth', 'login.json')]: CASE,
        [join(root, 'tests', 'login.spec.ts')]: SPEC,
        [join(root, 'review.json')]: reviewJson(),
      });
      const store = new QaStore({ projectRoot: root, fs });
      await new ManifestStore({ store }).register('tests/login.spec.ts', SPEC, { root: 'project' });
      return fs;
    }

    it('registers the verdict and says what it registered', async () => {
      const deps = dependencies({ fs: await projectFs() });

      const exitCode = await runCli(['review', 'add', '--path', 'review.json'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout).toContain('Registered artifacts/reviews/login.json (approved).');
    });

    it('prints machine-readable JSON with --json', async () => {
      const deps = dependencies({ fs: await projectFs() });

      await runCli(['review', 'add', '--path', 'review.json', '--json'], deps);

      expect(JSON.parse(deps.stdout.join('')) as unknown).toMatchObject({
        command: 'review-add',
        data: { testCaseId: 'login', verdict: 'approved' },
      });
    });

    it('defaults the project root to the current working directory', async () => {
      const { io } = captureIO();
      const fs = await projectFs(process.cwd());

      expect(await runCli(['review', 'add', '--path', 'review.json'], { io, fs, env: {} })).toBe(
        EXIT_SUCCESS,
      );
    });

    it('refuses a review with no --path', async () => {
      const deps = dependencies({ fs: await projectFs() });

      expect(await runCli(['review', 'add'], deps)).toBe(EXIT_FAILURE);
      expect(deps.stderr.join('\n')).toContain('Usage: qa review add --path <path>');
    });

    it('rejects a missing or unknown subcommand', async () => {
      const deps = dependencies();

      expect(await runCli(['review', 'sync'], deps)).toBe(EXIT_USAGE);
      expect(await runCli(['review'], deps)).toBe(EXIT_USAGE);
      expect(deps.stderr.join('\n')).toContain('Unknown "qa review" subcommand "sync"');
    });
  });

  describe('agents generate', () => {
    const CONFIG = [
      'schemaVersion: 1',
      'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
      'environments:',
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 2, spokeTimeoutSeconds: 60, retries: 1, models: { explorer: haiku } }',
      '',
    ].join('\n');

    it('writes the subagents with their models and says what it wrote', async () => {
      const fs = createFakeFileSystem({ [join(PROJECT_ROOT, '.qa', 'config.yaml')]: CONFIG });
      const deps = dependencies({ fs });

      const exitCode = await runCli(['agents', 'generate'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout).toContain('  .claude/agents/qa-explorer.md  model: haiku');
      expect(deps.stdout).toContain('  .claude/agents/qa-rca.md  model: inherit');
      expect(await fs.readFile(join(PROJECT_ROOT, '.claude', 'agents', 'qa-explorer.md'))).toContain(
        'model: haiku',
      );
    });

    it('prints machine-readable JSON with --json', async () => {
      const fs = createFakeFileSystem({ [join(PROJECT_ROOT, '.qa', 'config.yaml')]: CONFIG });
      const deps = dependencies({ fs });

      await runCli(['agents', 'generate', '--json'], deps);

      expect(JSON.parse(deps.stdout.join('')) as unknown).toMatchObject({
        command: 'agents-generate',
        data: { directory: '.claude/agents' },
      });
    });

    it('defaults the project root to the current working directory', async () => {
      const { io, stdout } = captureIO();
      const fs = createFakeFileSystem({ [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG });

      const exitCode = await runCli(['agents', 'generate'], { io, fs, env: {} });

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(stdout.join('\n')).toContain('.claude/agents/qa-explorer.md');
    });

    it('rejects an unknown subcommand', async () => {
      const deps = dependencies();

      const exitCode = await runCli(['agents', 'sync'], deps);

      expect(exitCode).toBe(EXIT_USAGE);
      expect(deps.stderr.join('\n')).toContain('Unknown "qa agents" subcommand "sync"');
    });

    it('rejects a missing subcommand', async () => {
      const deps = dependencies();

      expect(await runCli(['agents'], deps)).toBe(EXIT_USAGE);
      expect(deps.stderr.join('\n')).toContain('Unknown "qa agents" subcommand ""');
    });
  });

  it('runs "validate" and reports every gate open on a fresh project', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('[open] scope');
    expect(deps.stdout).toContain('[open] cases');
    expect(deps.stdout).toContain('Current phase: scope.');
    expect(deps.stdout).toContain('No unlinked cases.');
  });

  it('runs "validate" and prints machine-readable JSON with --json', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['validate', '--json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(deps.stdout[0] ?? '');
    expect(parsed).toMatchObject({ command: 'validate', data: { reopened: [] } });
  });

  it('reports a reopened gate and exits with a failure code once an approved artifact changes', async () => {
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: '{}',
      [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({ 'artifacts/scope.json': '{}' }),
    });
    const deps = dependencies({ fs });
    await runCli(
      ['approve', 'scope', '--artifact', 'artifacts/scope.json', '--approved-by', 'operator'],
      deps,
    );
    deps.stdout.length = 0;
    await fs.writeFile(join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json'), '{"requirements":[]}');

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout).toContain('[open] scope (reopened since last approval)');
  });

  it('reports a tampered artifact and exits with a failure code (P2-07)', async () => {
    const scopeJson = JSON.stringify({ generatedAt: '2026-09-20T12:00:00Z', requirements: [] });
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
      [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
        'artifacts/scope.json': scopeJson,
      }),
    });
    await fs.writeFile(
      join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json'),
      JSON.stringify({ generatedAt: '2026-09-20T12:00:00Z', requirements: [{ id: 'hand-edited' }] }),
    );
    const deps = dependencies({ fs });

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout).toContain('1 tampered artifact(s):');
    expect(deps.stdout).toContain('  artifacts/scope.json');
  });

  it('defaults the project root to the current working directory for "validate"', async () => {
    const { io, stdout } = captureIO();

    const exitCode = await runCli(['validate'], { io, fs: createFakeFileSystem(), env: {} });

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(stdout).toContain('[open] scope');
  });

  it('does not sweep run results without "--run"', async () => {
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'results', 'result-1.json')]: JSON.stringify({
        id: 'result-1',
        runId: 'run-1',
        testCaseId: 'case-1',
        testType: 'e2e',
        status: 'failed',
        startedAt: '2026-09-25T09:59:00.000Z',
        finishedAt: '2026-09-25T10:00:00.000Z',
        evidenceIds: ['fabricated'],
        failure: { message: 'boom' },
      }),
    });
    const deps = dependencies({ fs });

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).not.toContain('unresolved evidence');
  });

  it('runs "validate --run" and fails on a fabricated evidence link', async () => {
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'results', 'result-1.json')]: JSON.stringify({
        id: 'result-1',
        runId: 'run-1',
        testCaseId: 'case-1',
        testType: 'e2e',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        finishedAt: '2026-09-25T10:00:00.000Z',
        evidenceIds: ['fabricated'],
      }),
    });
    const deps = dependencies({ fs });

    const exitCode = await runCli(['validate', '--run'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.join('\n')).toContain('1 result(s) with unresolved evidence:');
    expect(deps.stdout.join('\n')).toContain('runs/run-1/results/result-1.json: fabricated');
  });

  it('runs "validate --run" and fails on a failed result with no registered evidence', async () => {
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'results', 'result-1.json')]: JSON.stringify({
        id: 'result-1',
        runId: 'run-1',
        testCaseId: 'case-1',
        testType: 'e2e',
        status: 'failed',
        startedAt: '2026-09-25T09:59:00.000Z',
        finishedAt: '2026-09-25T10:00:00.000Z',
        evidenceIds: [],
        failure: { message: 'boom' },
      }),
    });
    const deps = dependencies({ fs });

    const exitCode = await runCli(['validate', '--run'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.join('\n')).toContain('1 failed result(s) missing evidence:');
  });

  it('runs "validate --run" and succeeds when every result checks out', async () => {
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'results', 'result-1.json')]: JSON.stringify({
        id: 'result-1',
        runId: 'run-1',
        testCaseId: 'case-1',
        testType: 'e2e',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        finishedAt: '2026-09-25T10:00:00.000Z',
        evidenceIds: [],
      }),
    });
    const deps = dependencies({ fs });

    const exitCode = await runCli(['validate', '--run'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('No unresolved result evidence.');
    expect(deps.stdout.join('\n')).toContain('No failed results missing evidence.');
  });

  it('runs "cases add" and prints a human-readable confirmation', async () => {
    const scopeJson = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });
    const caseJson = JSON.stringify({
      id: 'case-1',
      feature: 'checkout',
      requirementIds: ['r1'],
      testType: 'e2e',
      title: 'A case',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    });
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
          'artifacts/scope.json': scopeJson,
        }),
        [join(PROJECT_ROOT, 'login.json')]: caseJson,
      }),
    });

    const exitCode = await runCli(['cases', 'add', '--path', 'login.json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Registered artifacts/cases/checkout/case-1.json: linked to r1.');
  });

  it('runs "link" and prints a human-readable confirmation', async () => {
    const scopeJson = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });
    const specContent = [
      "import { test } from '@playwright/test';",
      "test('logs in', { annotation: { type: 'testCaseId', description: 'existing-case-1' } }, async () => {});",
    ].join('\n');
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
          'artifacts/scope.json': scopeJson,
        }),
        [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: specContent,
      }),
    });

    const exitCode = await runCli(['link', 'tests/login.spec.ts', 'r1', '--feature', 'login'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Registered artifacts/cases/login/existing-case-1.json: linked to r1.');
  });

  it('warns when the spec has no testCaseId annotation yet', async () => {
    const scopeJson = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
          'artifacts/scope.json': scopeJson,
        }),
        [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: "test('logs in', async () => {});",
      }),
    });

    const exitCode = await runCli(['link', 'tests/login.spec.ts', 'r1', '--feature', 'login'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('No "testCaseId" annotation found in the spec');
  });

  it('runs "link" with an explicit --test-type', async () => {
    const scopeJson = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });
    const apiConfigYaml = [
      'schemaVersion: 1',
      'testing: { e2e: in-scope, api: in-scope, a11y: out-of-scope, security: out-of-scope }',
      'api: { contract: openapi, source: discover }',
      'environments: {}',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n');
    const specContent = [
      "import { test } from '@playwright/test';",
      "test('lists users', { annotation: { type: 'testCaseId', description: 'existing-case-1' } }, async () => {});",
    ].join('\n');
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: apiConfigYaml,
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
          'artifacts/scope.json': scopeJson,
        }),
        [join(PROJECT_ROOT, 'tests', 'users.spec.ts')]: specContent,
      }),
    });

    const exitCode = await runCli(
      ['link', 'tests/users.spec.ts', 'r1', '--feature', 'users', '--test-type', 'api'],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Registered artifacts/cases/users/existing-case-1.json: linked to r1.');
  });

  it('reports a coded error when "link" is given no spec, requirement id or --feature', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['link'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa link <spec> <requirement-id> --feature <name>');
  });

  it('reports a coded error when "link"’s requirement id is not in the scope artifact', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: "test('logs in', async () => {});",
      }),
    });

    const exitCode = await runCli(['link', 'tests/login.spec.ts', 'missing', '--feature', 'login'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('is not in artifacts/scope.json');
  });

  it('defaults the project root to the current working directory for "link"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['link', 'tests/login.spec.ts', 'r1', '--feature', 'login'], {
      io,
      fs: createFakeFileSystem({
        [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG_YAML_WITH_ENVIRONMENT,
      }),
      env: {},
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('does not exist');
  });

  it('runs "cases render" and prints the rendered Markdown', async () => {
    const caseJson = JSON.stringify({
      id: 'case-1',
      feature: 'checkout',
      requirementIds: ['r1'],
      testType: 'e2e',
      title: 'A case',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    });
    const deps = dependencies({
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'cases', 'checkout', 'case-1.json')]: caseJson,
      }),
    });

    const exitCode = await runCli(['cases', 'render', 'case-1'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('# A case');
    expect(deps.stdout.join('\n')).toContain('**Feature:** checkout');
  });

  it('reports a coded error when "cases render" is given no id', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['cases', 'render'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa cases render');
  });

  it('reports a coded error when "cases render" is given an id with no registered case', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['cases', 'render', 'missing'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('No registered test case with id "missing"');
  });

  it('defaults the project root to the current working directory for "cases render"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['cases', 'render', 'case-1'], {
      io,
      fs: createFakeFileSystem(),
      env: {},
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('No registered test case with id "case-1"');
  });

  const DEFECT_JSON = JSON.stringify({
    id: 'login-error',
    title: 'Invalid credentials show no error',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open the login page'],
    expectedResult: 'An error is shown',
    actualResult: 'Nothing is shown',
    environment: 'staging',
    requirementIds: [],
    evidencePaths: [],
    status: 'draft',
    createdAt: '2026-10-06T12:00:00Z',
  });

  it('runs "defect add" and then "defect accept", reporting a repeat accept as already accepted', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [join(PROJECT_ROOT, 'defect.json')]: DEFECT_JSON }),
    });

    const addExit = await runCli(['defect', 'add', '--path', 'defect.json'], deps);
    const acceptExit = await runCli(
      ['defect', 'accept', 'login-error', '--approved-by', 'operator', '--note', 'Reviewed'],
      deps,
    );
    const repeatExit = await runCli(['defect', 'accept', 'login-error', '--approved-by', 'operator'], deps);

    expect([addExit, acceptExit, repeatExit]).toEqual([EXIT_SUCCESS, EXIT_SUCCESS, EXIT_SUCCESS]);
    expect(deps.stdout).toContain('Registered artifacts/defects/login-error.json as a draft.');
    expect(deps.stdout).toContain('Accepted defect "login-error".');
    expect(deps.stdout).toContain('Defect "login-error" was already accepted.');
  });

  it('prints "defect add" and "defect accept" results as JSON with --json', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [join(PROJECT_ROOT, 'defect.json')]: DEFECT_JSON }),
    });

    await runCli(['defect', 'add', '--path', 'defect.json', '--json'], deps);
    await runCli(['defect', 'accept', 'login-error', '--approved-by', 'operator', '--json'], deps);

    expect(JSON.parse(deps.stdout[0] ?? '')).toMatchObject({ command: 'defect-add' });
    expect(JSON.parse(deps.stdout[1] ?? '')).toMatchObject({
      command: 'defect-accept',
      data: { id: 'login-error', status: 'accepted' },
    });
  });

  it('reports a usage error for "defect add" without --path and "defect accept" without an id or approver', async () => {
    const deps = dependencies({ fs: createFakeFileSystem() });

    expect(await runCli(['defect', 'add'], deps)).toBe(EXIT_FAILURE);
    expect(await runCli(['defect', 'accept', '--approved-by', 'operator'], deps)).toBe(EXIT_FAILURE);
    expect(await runCli(['defect', 'accept', 'login-error'], deps)).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa defect add --path <path>');
    expect(deps.stderr.join('\n')).toContain('Usage: qa defect accept <id> --approved-by <name>');
  });

  it('reports an unknown or missing "defect" subcommand as a usage error', async () => {
    const deps = dependencies({ fs: createFakeFileSystem() });

    expect(await runCli(['defect', 'bogus'], deps)).toBe(EXIT_USAGE);
    expect(await runCli(['defect'], deps)).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa defect" subcommand "bogus"');
    expect(deps.stderr.join('\n')).toContain('Unknown "qa defect" subcommand ""');
  });

  it('defaults the project root to the current working directory for "defect add" and "defect accept"', async () => {
    const { io, stderr } = captureIO();
    const dependenciesWithoutRoot = { io, fs: createFakeFileSystem(), env: {} };

    expect(await runCli(['defect', 'add', '--path', 'defect.json'], dependenciesWithoutRoot)).toBe(
      EXIT_FAILURE,
    );
    expect(
      await runCli(['defect', 'accept', 'login-error', '--approved-by', 'operator'], dependenciesWithoutRoot),
    ).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('defect.json');
    expect(stderr.join('\n')).toContain('No registered defect draft with id "login-error"');
  });

  describe('security (P6-18)', () => {
    const SECURITY_CONFIG = (security: string): string =>
      [
        'schemaVersion: 1',
        `testing: { e2e: undecided, api: undecided, a11y: undecided, security: ${security} }`,
        'environments:',
        '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
        'identities: {}',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        '',
      ].join('\n');
    const AUTHORIZATION = JSON.stringify({
      schemaVersion: 1,
      environment: {
        name: 'staging',
        baseUrl: 'https://staging.example.test/',
        allowlist: ['staging.example.test'],
      },
      checks: ['headers'],
      identities: [],
      prohibitedActions: ['brute force'],
      allowedMutations: [],
      restrictedRoutes: [],
      rateLimit: { requestsPerSecond: 50, maxRequests: 100 },
      createdAt: '2026-10-10T10:00:00Z',
    });
    const withSecurity = (security = 'in-scope') =>
      dependencies({
        fs: createFakeFileSystem({
          [CONFIG_PATH]: SECURITY_CONFIG(security),
          [join(PROJECT_ROOT, 'authorization.json')]: AUTHORIZATION,
        }),
        httpClient: {
          get: () => Promise.reject(new Error('get() is not used')),
          request: () =>
            Promise.resolve({ ok: true, status: 200, headers: {}, setCookies: [], bodyText: '' }),
        },
      });

    it('registers an authorization, then records the operator approval, and says it is not consent yet', async () => {
      const deps = withSecurity();

      const registered = await runCli(['security', 'authorize', '--path', 'authorization.json'], deps);
      const approved = await runCli(['security', 'approve', '--approved-by', 'operator'], deps);
      const again = await runCli(['security', 'approve', '--approved-by', 'operator'], deps);

      expect([registered, approved, again]).toEqual([EXIT_SUCCESS, EXIT_SUCCESS, EXIT_SUCCESS]);
      expect(deps.stdout.join('\n')).toContain(
        'Registered the security audit authorization for "staging" (headers).',
      );
      expect(deps.stdout.join('\n')).toContain('It is not consent yet');
      expect(deps.stdout).toContain('Approved the security audit authorization.');
      expect(deps.stdout).toContain('The security audit authorization was already approved.');
    });

    it('audits an authorized project, lists the drafts and exits non-zero while there is a finding', async () => {
      const deps = withSecurity();
      await runCli(['security', 'authorize', '--path', 'authorization.json'], deps);
      await runCli(['security', 'approve', '--approved-by', 'operator'], deps);
      deps.stdout.length = 0;

      const exitCode = await runCli(['security', 'audit'], deps);

      const output = deps.stdout.join('\n');
      expect(exitCode).toBe(EXIT_FAILURE);
      expect(output).toMatch(/Security audit audit-[\w-]+ of "staging": completed, \d+ finding\(s\)/u);
      expect(output).toContain('  headers: failed  ');
      expect(output).toContain('Defect drafts to review: security-');
      expect(output).toContain('Evidence: ');
    });

    const authorizedWith = async (
      overrides: Record<string, unknown>,
      headers: Record<string, string> = {},
    ) => {
      const deps = dependencies({
        fs: createFakeFileSystem({
          [CONFIG_PATH]: SECURITY_CONFIG('in-scope'),
          [join(PROJECT_ROOT, 'authorization.json')]: JSON.stringify({
            ...(JSON.parse(AUTHORIZATION) as Record<string, unknown>),
            ...overrides,
          }),
        }),
        httpClient: {
          get: () => Promise.reject(new Error('get() is not used')),
          request: () => Promise.resolve({ ok: true, status: 200, headers, setCookies: [], bodyText: '' }),
        },
      });
      await runCli(['security', 'authorize', '--path', 'authorization.json'], deps);
      await runCli(['security', 'approve', '--approved-by', 'operator'], deps);
      deps.stdout.length = 0;
      return deps;
    };

    it('exits zero for a completed audit with nothing found, and says which check did not run', async () => {
      const deps = await authorizedWith({ checks: ['dependencies'] });

      const exitCode = await runCli(['security', 'audit'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout.join('\n')).toContain('completed, 0 finding(s)');
      expect(deps.stdout.join('\n')).toContain('dependencies: skipped  Not run:');
      expect(deps.stdout.join('\n')).not.toContain('Defect drafts to review');
    });

    it('lists a check that passed with what it read, and exits zero', async () => {
      const deps = await authorizedWith(
        { checks: ['headers'] },
        {
          'content-security-policy': "frame-ancestors 'self'",
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'strict-transport-security': 'max-age=31536000',
        },
      );

      const exitCode = await runCli(['security', 'audit'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout.join('\n')).toContain('  headers: passed  Read the headers');
    });

    it('says an audit that ran out of its request budget stopped early and is not clean', async () => {
      const deps = await authorizedWith({
        checks: ['headers', 'cookies', 'errors'],
        rateLimit: { requestsPerSecond: 50, maxRequests: 1 },
      });

      const exitCode = await runCli(['security', 'audit'], deps);

      expect(exitCode).toBe(EXIT_FAILURE);
      expect(deps.stdout.join('\n')).toContain('partial');
      expect(deps.stdout.join('\n')).toContain('Stopped early: ');
    });

    it('prints the audit as JSON with --json', async () => {
      const deps = withSecurity();
      await runCli(['security', 'authorize', '--path', 'authorization.json'], deps);
      await runCli(['security', 'approve', '--approved-by', 'operator'], deps);
      deps.stdout.length = 0;

      await runCli(['security', 'audit', '--json'], deps);

      expect(JSON.parse(deps.stdout[0] ?? '')).toMatchObject({
        command: 'security-audit',
        data: { environment: 'staging', status: 'completed' },
      });
    });

    it('refuses every subcommand with a coded error when security testing is not in scope', async () => {
      for (const args of [
        ['security', 'authorize', '--path', 'authorization.json'],
        ['security', 'approve', '--approved-by', 'operator'],
        ['security', 'audit'],
      ]) {
        const deps = withSecurity('out-of-scope');

        const exitCode = await runCli(args, deps);

        expect(exitCode).toBe(EXIT_FAILURE);
        expect(deps.stderr.join('\n')).toContain('Security testing is "out-of-scope"');
      }
    });

    it('refuses an audit that was never authorized, and sends no request', async () => {
      const deps = withSecurity();

      const exitCode = await runCli(['security', 'audit'], deps);

      expect(exitCode).toBe(EXIT_FAILURE);
      expect(deps.stderr.join('\n')).toContain('error:');
    });

    it('asks for what a subcommand needs, and rejects an unknown one', async () => {
      const deps = withSecurity();

      const noPath = await runCli(['security', 'authorize'], deps);
      const noApprover = await runCli(['security', 'approve'], deps);
      const unknown = await runCli(['security', 'bogus'], deps);
      const bare = await runCli(['security'], deps);

      expect([noPath, noApprover, unknown, bare]).toEqual([
        EXIT_FAILURE,
        EXIT_FAILURE,
        EXIT_USAGE,
        EXIT_USAGE,
      ]);
      expect(deps.stderr.join('\n')).toContain('Usage: qa security authorize --path <path>');
      expect(deps.stderr.join('\n')).toContain('Usage: qa security approve --approved-by <name>');
    });

    it('defaults the project root to the current working directory', async () => {
      const { io, stderr } = captureIO();
      const dependenciesWithoutRoot = { io, fs: createFakeFileSystem(), env: {} };

      const results = [
        await runCli(['security', 'authorize', '--path', 'authorization.json'], dependenciesWithoutRoot),
        await runCli(
          ['security', 'approve', '--approved-by', 'operator', '--note', 'ok'],
          dependenciesWithoutRoot,
        ),
        await runCli(['security', 'audit'], dependenciesWithoutRoot),
      ];

      expect(results).toEqual([EXIT_FAILURE, EXIT_FAILURE, EXIT_FAILURE]);
      expect(stderr.join('\n')).toContain('config.yaml');
    });
  });

  const RCA_JSON = JSON.stringify({
    defectId: 'login-error',
    facts: ['The login request returns 401'],
    hypotheses: [{ description: 'The handler is not wired', confidence: 'medium' }],
    remediation: [],
    status: 'draft',
    createdAt: '2026-10-07T12:00:00Z',
  });

  function rcaFiles(): Record<string, string> {
    return {
      [join(PROJECT_ROOT, 'defect.json')]: DEFECT_JSON,
      [join(PROJECT_ROOT, 'rca.json')]: RCA_JSON,
    };
  }

  it('runs "rca add" and "rca approve" for an accepted defect, reporting a repeat approval', async () => {
    const deps = dependencies({ fs: createFakeFileSystem(rcaFiles()) });
    await runCli(['defect', 'add', '--path', 'defect.json'], deps);
    await runCli(['defect', 'accept', 'login-error', '--approved-by', 'operator'], deps);

    const addExit = await runCli(['rca', 'add', '--path', 'rca.json'], deps);
    const approveExit = await runCli(
      ['rca', 'approve', 'login-error', '--approved-by', 'reviewer', '--note', 'Reviewed'],
      deps,
    );
    const repeatExit = await runCli(['rca', 'approve', 'login-error', '--approved-by', 'reviewer'], deps);

    expect([addExit, approveExit, repeatExit]).toEqual([EXIT_SUCCESS, EXIT_SUCCESS, EXIT_SUCCESS]);
    expect(deps.stdout).toContain('Registered artifacts/rca/login-error.json as a draft.');
    expect(deps.stdout).toContain('Approved the RCA for "login-error".');
    expect(deps.stdout).toContain('The RCA for "login-error" was already approved.');
  });

  it('prints "rca add" and "rca approve" results as JSON with --json', async () => {
    const deps = dependencies({ fs: createFakeFileSystem(rcaFiles()) });
    await runCli(['defect', 'add', '--path', 'defect.json'], deps);
    await runCli(['defect', 'accept', 'login-error', '--approved-by', 'operator'], deps);
    deps.stdout.length = 0;

    await runCli(['rca', 'add', '--path', 'rca.json', '--json'], deps);
    await runCli(['rca', 'approve', 'login-error', '--approved-by', 'reviewer', '--json'], deps);

    expect(JSON.parse(deps.stdout[0] ?? '')).toMatchObject({ command: 'rca-add' });
    expect(JSON.parse(deps.stdout[1] ?? '')).toMatchObject({
      command: 'rca-approve',
      data: { defectId: 'login-error', status: 'approved' },
    });
  });

  it('refuses "rca add" for a defect that is not accepted', async () => {
    const deps = dependencies({ fs: createFakeFileSystem(rcaFiles()) });
    await runCli(['defect', 'add', '--path', 'defect.json'], deps);

    expect(await runCli(['rca', 'add', '--path', 'rca.json'], deps)).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Defect "login-error" is not accepted');
  });

  it('reports a usage error for "rca add" without --path and "rca approve" without an id or approver', async () => {
    const deps = dependencies({ fs: createFakeFileSystem() });

    expect(await runCli(['rca', 'add'], deps)).toBe(EXIT_FAILURE);
    expect(await runCli(['rca', 'approve', '--approved-by', 'reviewer'], deps)).toBe(EXIT_FAILURE);
    expect(await runCli(['rca', 'approve', 'login-error'], deps)).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa rca add --path <path>');
    expect(deps.stderr.join('\n')).toContain('Usage: qa rca approve <defect-id> --approved-by <name>');
  });

  it('reports an unknown or missing "rca" subcommand as a usage error', async () => {
    const deps = dependencies({ fs: createFakeFileSystem() });

    expect(await runCli(['rca', 'bogus'], deps)).toBe(EXIT_USAGE);
    expect(await runCli(['rca'], deps)).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa rca" subcommand "bogus"');
    expect(deps.stderr.join('\n')).toContain('Unknown "qa rca" subcommand ""');
  });

  it('defaults the project root to the current working directory for "rca add" and "rca approve"', async () => {
    const { io, stderr } = captureIO();
    const dependenciesWithoutRoot = { io, fs: createFakeFileSystem(), env: {} };

    expect(await runCli(['rca', 'add', '--path', 'rca.json'], dependenciesWithoutRoot)).toBe(EXIT_FAILURE);
    expect(
      await runCli(['rca', 'approve', 'login-error', '--approved-by', 'reviewer'], dependenciesWithoutRoot),
    ).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('rca.json');
    expect(stderr.join('\n')).toContain('No registered RCA for defect "login-error"');
  });

  it('runs "test-data add" and prints a human-readable confirmation', async () => {
    const testDataJson = JSON.stringify({
      id: 'valid-card',
      feature: 'checkout',
      values: { cardNumber: '4111111111111111' },
    });
    const deps = dependencies({
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, 'card.json')]: testDataJson,
      }),
    });

    const exitCode = await runCli(['test-data', 'add', '--path', 'card.json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Registered artifacts/test-data/checkout/valid-card.json.');
  });

  it('reports a usage error for an unknown "test-data" subcommand', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['test-data', 'bogus'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa test-data" subcommand "bogus"');
  });

  it('reports a usage error when "test-data" is given no subcommand at all', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['test-data'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa test-data" subcommand ""');
  });

  it('reports a coded error when "test-data add" is given no --path', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['test-data', 'add'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa test-data add');
  });

  it('defaults the project root to the current working directory for "test-data add"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['test-data', 'add', '--path', 'card.json'], {
      io,
      fs: createFakeFileSystem(),
      env: {},
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('card.json');
  });

  it('reports a coded error when "cases add" is given no --path', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['cases', 'add'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa cases add');
  });

  it('reports a usage error for an unknown "cases" subcommand', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['cases', 'bogus'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa cases" subcommand "bogus"');
  });

  it('reports a usage error when "cases" is given no subcommand at all', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['cases'], deps);

    expect(exitCode).toBe(EXIT_USAGE);
    expect(deps.stderr.join('\n')).toContain('Unknown "qa cases" subcommand ""');
  });

  it('defaults the project root to the current working directory for "cases add"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['cases', 'add', '--path', 'login.json'], {
      io,
      fs: createFakeFileSystem(),
      env: {},
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('login.json');
  });

  it('"validate" fails with an unlinked-case exit code once a registered case loses its requirement', async () => {
    const scopeJson = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });
    const caseJson = JSON.stringify({
      id: 'case-1',
      feature: 'checkout',
      requirementIds: ['r1'],
      testType: 'e2e',
      title: 'A case',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    });
    const fs = createFakeFileSystem({
      [CONFIG_PATH]: CONFIG_YAML,
      [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
      [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
        'artifacts/scope.json': scopeJson,
      }),
      [join(PROJECT_ROOT, 'login.json')]: caseJson,
    });
    const deps = dependencies({ fs });
    await runCli(['cases', 'add', '--path', 'login.json'], deps);
    deps.stdout.length = 0;
    await fs.writeFile(
      join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json'),
      JSON.stringify({ generatedAt: '2026-09-20T12:00:00Z', requirements: [] }),
    );

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.join('\n')).toContain('1 unlinked case(s):');
  });

  it('"validate" fails with an exit code once a case references an unregistered test-data set', async () => {
    const scopeJson = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });
    const caseJson = JSON.stringify({
      id: 'case-1',
      feature: 'checkout',
      requirementIds: ['r1'],
      testType: 'e2e',
      title: 'A case',
      testDataRefs: ['missing-card'],
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    });
    const deps = dependencies({
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: scopeJson,
        [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
          'artifacts/scope.json': scopeJson,
        }),
        [join(PROJECT_ROOT, '.qa', 'artifacts', 'cases', 'checkout', 'case-1.json')]: caseJson,
      }),
    });

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.join('\n')).toContain('1 case(s) with unresolved test data:');
  });

  const CONFIG_YAML_WITH_ENVIRONMENT = [
    'schemaVersion: 1',
    'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');

  /**
   * A `ProcessRunner` fake that, instead of spawning Playwright for real, reads the ephemeral
   * config `playwright-runner.ts` generated (its `--config=<path>` argument), extracts the report
   * path it declared, and writes a hand-built report there through the same fake `FileSystem` the
   * rest of the run uses — exercises the real `qa run` → `runTestRun` → `playwrightRunner` →
   * report-mapping chain end to end without a real browser or child process.
   */
  function fakeProcessRunnerWritingReport(fs: FileSystem, report: unknown) {
    return {
      run: async (_command: string, args: readonly string[]) => {
        const configArg = args.find((arg) => arg.startsWith('--config='));
        const configPath = configArg?.slice('--config='.length);
        if (configPath === undefined) {
          throw new Error('Expected a --config=<path> argument.');
        }
        const configSource = await fs.readFile(configPath);
        const configJson = configSource.slice('export default '.length).replace(/;\s*$/, '');
        const config = JSON.parse(configJson) as { reporter: readonly [string, { outputFile: string }][] };
        const [, { outputFile }] = config.reporter[0] as [string, { outputFile: string }];
        await fs.writeFile(outputFile, JSON.stringify(report));
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
  }

  it('runs "run" end to end and reports success when every result passed', async () => {
    const fs = createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML_WITH_ENVIRONMENT });
    const deps = dependencies({
      fs,
      processRunner: fakeProcessRunnerWritingReport(fs, {
        suites: [
          {
            specs: [
              {
                title: 'login',
                tests: [
                  {
                    annotations: [{ type: 'testCaseId', description: 'login-case' }],
                    results: [
                      { status: 'passed', startTime: '2026-09-25T10:00:00.000Z', duration: 1000, errors: [] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const exitCode = await runCli(
      ['run', '--spec', 'tests/login.playwright-spec.ts', '--environment', 'staging', '--json'],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed = JSON.parse(deps.stdout[0] ?? '') as { data: { counts: Record<string, number> } };
    expect(parsed.data.counts).toMatchObject({ passed: 1, failed: 0 });
  });

  // P6-89: the sign-in reaches Playwright as a storage-state file that exists only for the run.
  it('runs "run --identity" signed in, names the identity and leaves no session behind', async () => {
    const fs = createFakeFileSystem({
      [CONFIG_PATH]: CONFIG_YAML_WITH_ENVIRONMENT.replace(
        'identities: {}',
        'identities:\n  tester: { auth: storage-state, secret: QA_TESTER_PASSWORD, loginUrl: "https://staging.example.test/login", username: "tester@example.test" }',
      ),
    });
    const sessionCookie = {
      name: 'session',
      value: 'live-session-value',
      domain: 'staging.example.test',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    };
    const writeReport = fakeProcessRunnerWritingReport(fs, {
      suites: [
        {
          specs: [
            {
              title: 'login',
              tests: [
                {
                  annotations: [{ type: 'testCaseId', description: 'login-case' }],
                  results: [
                    { status: 'passed', startTime: '2026-09-25T10:00:00.000Z', duration: 1000, errors: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    let configSource = '';
    let storageStateDuringRun = '';
    const deps = dependencies({
      fs,
      env: { QA_TESTER_PASSWORD: 'hunter2' },
      browserLauncher: createFakeBrowserLauncher({ storageState: { cookies: [sessionCookie], origins: [] } }),
      processRunner: {
        run: async (command: string, args: readonly string[]) => {
          const configPath = (args.find((arg) => arg.startsWith('--config=')) ?? '').slice(
            '--config='.length,
          );
          configSource = await fs.readFile(configPath);
          const storageStatePath = (
            JSON.parse(configSource.slice('export default '.length).replace(/;\s*$/, '')) as {
              use: { storageState: string };
            }
          ).use.storageState;
          storageStateDuringRun = await fs.readFile(storageStatePath);
          return writeReport.run(command, args);
        },
      },
    });

    const exitCode = await runCli(
      ['run', '--spec', 'tests/login.playwright-spec.ts', '--identity', 'tester'],
      deps,
    );

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('Signed in as identity "tester".');
    expect(storageStateDuringRun).toContain('live-session-value');
    expect(configSource).not.toContain('live-session-value');
    expect(configSource).not.toContain('hunter2');
    expect(configSource).toContain('"trace": "off"');
    const leftovers = (await fs.listFiles('/')).filter((file) => file.endsWith('storage-state.json'));
    expect(leftovers).toEqual([]);
    const persisted = await Promise.all((await fs.listFiles(PROJECT_ROOT)).map((file) => fs.readFile(file)));
    expect(persisted.join('\n')).toContain('"identity": "tester"');
    expect(persisted.join('\n')).not.toContain('live-session-value');
  });

  // P3-19: a spec path matching zero tests must fail loud, not report a clean zero-count success —
  // a silent false green, since nothing was actually verified.
  it('runs "run" end to end and fails when the runner produced no results', async () => {
    const fs = createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML_WITH_ENVIRONMENT });
    const deps = dependencies({
      fs,
      processRunner: fakeProcessRunnerWritingReport(fs, { suites: [] }),
    });

    const exitCode = await runCli(['run', '--spec', 'tests/login.playwright-spec.ts'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('error:');
    expect(deps.stderr.join('\n')).toContain('zero results');
  });

  it('runs "run" end to end and reports failure when a result failed', async () => {
    const fs = createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML_WITH_ENVIRONMENT });
    const deps = dependencies({
      fs,
      processRunner: fakeProcessRunnerWritingReport(fs, {
        suites: [
          {
            specs: [
              {
                title: 'login',
                tests: [
                  {
                    annotations: [{ type: 'testCaseId', description: 'login-case' }],
                    results: [
                      {
                        status: 'failed',
                        startTime: '2026-09-25T10:00:00.000Z',
                        duration: 1000,
                        errors: [{ message: 'Expected the dashboard' }],
                        attachments: [{ name: 'screenshot', contentType: 'image/png', body: 'AQID' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const exitCode = await runCli(['run', '--spec', 'tests/login.playwright-spec.ts'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stdout.join('\n')).toContain('failed: 1');
  });

  it('reports a coded error when "run" is given no --spec', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['run'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Usage: qa run');
  });

  it('reports a coded error when "run --test-type" is an unknown value', async () => {
    const deps = dependencies();

    const exitCode = await runCli(
      ['run', '--spec', 'tests/login.playwright-spec.ts', '--test-type', 'security'],
      deps,
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('is not valid for --test-type');
  });

  it('wires "run --test-type a11y" through to the accessibility runner', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML_WITH_ENVIRONMENT }),
      processRunner: { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
    });

    const exitCode = await runCli(
      ['run', '--spec', 'tests/login.playwright-spec.ts', '--test-type', 'a11y'],
      deps,
    );

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Playwright did not produce a JSON report');
  });

  it('wires "run" through to the real Playwright runner, which reports a coded error when the process produced no report', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML_WITH_ENVIRONMENT }),
      processRunner: { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
    });

    const exitCode = await runCli(['run', '--spec', 'tests/login.playwright-spec.ts'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('Playwright did not produce a JSON report');
  });

  it('defaults the project root to the current working directory for "run"', async () => {
    const { io, stderr } = captureIO();

    const exitCode = await runCli(['run', '--spec', 'tests/login.playwright-spec.ts'], {
      io,
      fs: createFakeFileSystem({ [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG_YAML_WITH_ENVIRONMENT }),
      env: {},
      processRunner: { run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }) },
    });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stderr.join('\n')).toContain('Playwright did not produce a JSON report');
  });

  it('runs "report" end to end and renders the given run as Markdown by default', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'run.json')]: runRecordJson(
          'run-1',
          '2026-09-25T10:00:00.000Z',
        ),
      }),
    });

    const exitCode = await runCli(['report', '--run', 'run-1'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('# Run summary: run-1');
    expect(deps.stdout.join('\n')).toContain('# Traceability matrix');
  });

  it('appends the accessibility conformance section to "report" when a11y testing is in scope', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML.replace('a11y: out-of-scope', 'a11y: in-scope'),
        [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'run.json')]: runRecordJson(
          'run-1',
          '2026-09-25T10:00:00.000Z',
        ),
      }),
    });

    const exitCode = await runCli(['report', '--run', 'run-1'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('## Accessibility conformance: WCAG 2.1 level AA');
  });

  it('runs "report --format html" end to end', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'run.json')]: runRecordJson(
          'run-1',
          '2026-09-25T10:00:00.000Z',
        ),
      }),
    });

    const exitCode = await runCli(['report', '--run', 'run-1', '--format', 'html'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('<h1>Run summary: run-1</h1>');
  });

  it('defaults "report" to the most recently started run when --run is omitted', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'runs', 'run-older', 'run.json')]: runRecordJson(
          'run-older',
          '2026-09-24T10:00:00.000Z',
        ),
        [join(PROJECT_ROOT, '.qa', 'runs', 'run-newer', 'run.json')]: runRecordJson(
          'run-newer',
          '2026-09-25T10:00:00.000Z',
        ),
      }),
    });

    const exitCode = await runCli(['report', '--json'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    const parsed = JSON.parse(deps.stdout[0] ?? '') as { data: { runId: string } };
    expect(parsed.data.runId).toBe('run-newer');
  });

  it('reports a coded error when "report" is run before any "run" has ever happened', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['report'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('No runs or live execution results are recorded yet');
  });

  it('prints the live execution results when "report" finds no qa run record, only registered case results', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [join(PROJECT_ROOT, '.qa', 'runs', 'case-a', 'result-1.json')]: JSON.stringify({
          schemaVersion: 1,
          id: 'result-1',
          runId: 'run-live-1',
          testCaseId: 'case-a',
          testType: 'e2e',
          status: 'passed',
          startedAt: '2026-09-25T09:00:00.000Z',
          finishedAt: '2026-09-25T09:01:00.000Z',
          evidenceIds: ['evidence-1'],
        }),
      }),
    });

    const exitCode = await runCli(['report'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).toContain('# Live execution results');
    expect(deps.stdout.join('\n')).toContain('| case-a | e2e | passed |');
    expect(deps.stdout.join('\n')).not.toContain('# Run summary');
  });

  describe('"report --output" (P6-104)', () => {
    function reportDeps(): ReturnType<typeof dependencies> {
      return dependencies({
        fs: createFakeFileSystem({
          [CONFIG_PATH]: CONFIG_YAML,
          [join(PROJECT_ROOT, '.qa', 'runs', 'run-1', 'run.json')]: runRecordJson(
            'run-1',
            '2026-09-25T10:00:00.000Z',
          ),
        }),
      });
    }

    it('saves the report under the default path when --output stands alone', async () => {
      const deps = reportDeps();

      const exitCode = await runCli(['report', '--run', 'run-1', '--output'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(deps.stdout.join('\n')).toMatch(
        /Saved the run-result report to artifacts\/reports\/run-result-\d{4}-\d{2}-\d{2}\.md\./,
      );
    });

    it('saves the report to the given path', async () => {
      const deps = reportDeps();

      const exitCode = await runCli(['report', '--run', 'run-1', '--output', 'docs/results.md'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(await deps.fs?.readFile(join(PROJECT_ROOT, '.qa', 'docs', 'results.md'))).toContain(
        '# Run result report',
      );
    });

    it('treats --output followed by another flag as the bare flag', async () => {
      const deps = reportDeps();

      const exitCode = await runCli(['report', '--run', 'run-1', '--output', '--json'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      const parsed = JSON.parse(deps.stdout[0] ?? '') as { data: { reportPath: string } };
      expect(parsed.data.reportPath).toMatch(/^artifacts\/reports\/run-result-/);
    });
  });

  it('reports a coded error when "report --format" is an unknown value', async () => {
    const deps = dependencies();

    const exitCode = await runCli(['report', '--format', 'pdf'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.join('\n')).toContain('is not valid for --format');
  });

  it('defaults the project root to the current working directory for "report"', async () => {
    const { io, stdout } = captureIO();

    const exitCode = await runCli(['report'], {
      io,
      fs: createFakeFileSystem({
        [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG_YAML,
        [join(process.cwd(), '.qa', 'runs', 'run-1', 'run.json')]: runRecordJson(
          'run-1',
          '2026-09-25T10:00:00.000Z',
        ),
      }),
      env: {},
    });

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(stdout.join('\n')).toContain('# Run summary: run-1');
  });
});

describe('configuration relaxations', () => {
  const LOCAL_PATH = join(PROJECT_ROOT, '.qa', 'config.local.yaml');
  const RELAXING_LOCAL_YAML = [
    'environments:',
    '  dev:',
    '    baseUrl: http://localhost:4310',
    '    allowlist: [localhost]',
    '    tlsInsecure: true',
    '',
  ].join('\n');

  it('prints every relaxation from the local layer to stderr, one line each', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [LOCAL_PATH]: RELAXING_LOCAL_YAML }),
    });

    await runCli(['validate', '--json'], deps);

    const warnings = deps.stderr.filter((line) => line.startsWith('warning: CONFIG_RELAXATION'));
    expect(warnings).toStrictEqual([
      'warning: CONFIG_RELAXATION .qa/config.local.yaml adds "localhost" to the allowlist of environment "dev", which .qa/config.yaml does not list',
      'warning: CONFIG_RELAXATION .qa/config.local.yaml disables TLS certificate validation (tlsInsecure) for environment "dev", which .qa/config.yaml does not',
    ]);
    expect(deps.stdout.join('\n')).not.toContain('CONFIG_RELAXATION');
  });

  it('names the file QA_CONFIG_LOCAL selects', async () => {
    const ciPath = join(PROJECT_ROOT, 'ci', 'qa.local.yaml');
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [ciPath]: RELAXING_LOCAL_YAML }),
      env: { QA_CONFIG_LOCAL: 'ci/qa.local.yaml' },
    });

    await runCli(['validate'], deps);

    expect(deps.stderr[0]).toContain('CONFIG_RELAXATION ci/qa.local.yaml adds "localhost"');
  });

  it('prints nothing when there is no local layer', async () => {
    const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    await runCli(['validate'], deps);

    expect(deps.stderr.join('\n')).not.toContain('CONFIG_RELAXATION');
  });

  it('prints nothing for init, which writes the configuration rather than reading it', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [LOCAL_PATH]: RELAXING_LOCAL_YAML }),
    });

    const exitCode = await runCli(['init'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stderr).toStrictEqual([]);
  });

  it('leaves an invalid local layer for the command itself to report', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({
        [CONFIG_PATH]: CONFIG_YAML,
        [LOCAL_PATH]: 'testing:\n  e2e: out-of-scope\n',
      }),
    });

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr.filter((line) => line.includes('"testing"'))).toHaveLength(1);
    expect(deps.stderr[0]).toContain('error:');
  });

  it('defaults the project root to the current working directory when checking for relaxations', async () => {
    const fs = createFakeFileSystem({
      [join(process.cwd(), '.qa', 'config.yaml')]: CONFIG_YAML,
      [join(process.cwd(), '.qa', 'config.local.yaml')]: RELAXING_LOCAL_YAML,
    });
    const { io, stderr } = captureIO();

    await runCli(['validate'], { io, fs, env: {} });

    expect(stderr.some((line) => line.startsWith('warning: CONFIG_RELAXATION'))).toBe(true);
  });

  it('reports an unexpected failure while checking for relaxations as the command error', async () => {
    const failing: FileSystem = {
      ...createFakeFileSystem(),
      pathExists: () => Promise.reject(new Error('disk unreadable')),
    };
    const deps = dependencies({ fs: failing });

    const exitCode = await runCli(['validate'], deps);

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(deps.stderr).toStrictEqual(['error: disk unreadable']);
  });
});

describe('"config show"', () => {
  const LOCAL_PATH = join(PROJECT_ROOT, '.qa', 'config.local.yaml');
  const LOCAL_YAML = [
    'environments:',
    '  dev:',
    '    baseUrl: http://localhost:4310',
    '    allowlist: [localhost]',
    '',
  ].join('\n');

  it('prints the effective configuration as YAML, with no local layer', async () => {
    const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    const exitCode = await runCli(['config', 'show'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Local layer: none');
    expect(deps.stdout.some((line) => line.includes('e2e: in-scope'))).toBe(true);
    expect(deps.stdout).toContain('No relaxations.');
  });

  it('names the local layer and lists its relaxations', async () => {
    const relaxingLocal = [
      'environments:',
      '  dev:',
      '    baseUrl: http://localhost:4310',
      '    allowlist: [localhost]',
      '    tlsInsecure: true',
      '',
    ].join('\n');
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [LOCAL_PATH]: relaxingLocal }),
    });

    const exitCode = await runCli(['config', 'show'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('Local layer: .qa/config.local.yaml');
    expect(
      deps.stdout.some(
        (line) => line.includes('disables TLS certificate validation') && line.includes('dev'),
      ),
    ).toBe(true);
  });

  it('with --explain, names the source layer of every value', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [LOCAL_PATH]: LOCAL_YAML }),
    });

    const exitCode = await runCli(['config', 'show', '--explain'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout).toContain('testing.e2e = "in-scope"  (.qa/config.yaml)');
    expect(deps.stdout).toContain(
      'environments.dev.baseUrl = "http://localhost:4310"  (.qa/config.local.yaml)',
    );
    expect(deps.stdout).toContain('flaky.historyWindow = 10  (default)');
  });

  it('without --explain, does not name the source layer of any value', async () => {
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML, [LOCAL_PATH]: LOCAL_YAML }),
    });

    const exitCode = await runCli(['config', 'show'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.some((line) => line.includes('(.qa/config.yaml)'))).toBe(false);
  });

  it('prints machine-readable JSON with --json, including values only with --explain', async () => {
    const withoutExplain = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });
    const withExplain = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

    await runCli(['config', 'show', '--json'], withoutExplain);
    await runCli(['config', 'show', '--explain', '--json'], withExplain);

    const plain = JSON.parse(withoutExplain.stdout[0] ?? '') as { data: Record<string, unknown> };
    expect(plain.data.config).toBeDefined();
    expect(plain.data.localLayerPath).toBeUndefined();
    expect(plain.data.relaxations).toStrictEqual([]);
    expect(plain.data.values).toBeUndefined();

    const explained = JSON.parse(withExplain.stdout[0] ?? '') as { data: Record<string, unknown> };
    expect(Array.isArray(explained.data.values)).toBe(true);
    expect(explained.data.values).toContainEqual({
      path: ['testing', 'e2e'],
      value: 'in-scope',
      layer: 'committed',
    });
  });

  it('never prints an identity secret value, only its environment-variable name', async () => {
    const configWithIdentity = CONFIG_YAML.replace(
      'identities: {}',
      'identities:\n  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
    );
    const deps = dependencies({
      fs: createFakeFileSystem({ [CONFIG_PATH]: configWithIdentity }),
      env: { QA_ADMIN_PASSWORD: 'super-secret-value' },
    });

    const exitCode = await runCli(['config', 'show', '--explain'], deps);

    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(deps.stdout.join('\n')).not.toContain('super-secret-value');
  });

  it('defaults the project root to the current working directory', async () => {
    const { io, stdout } = captureIO();

    const exitCode = await runCli(['config', 'show'], { io, fs: createFakeFileSystem(), env: {} });

    expect(exitCode).toBe(EXIT_FAILURE);
    expect(stdout).toStrictEqual([]);
  });

  describe('status (#634)', () => {
    const SCOPE_JSON = JSON.stringify({
      generatedAt: '2026-09-20T12:00:00Z',
      requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
    });

    function caseJson(id: string): string {
      return JSON.stringify({
        schemaVersion: 1,
        id,
        feature: 'checkout',
        requirementIds: ['r1'],
        testType: 'e2e',
        title: `Case ${id}`,
        steps: [{ description: 'Do something' }],
        expectedResult: 'Something happens',
        status: 'draft',
        createdAt: '2026-09-20T12:00:00Z',
      });
    }

    function passedResultJson(id: string, testCaseId: string): string {
      return JSON.stringify({
        schemaVersion: 1,
        id,
        runId: `run-${id}`,
        testCaseId,
        testType: 'e2e',
        status: 'passed',
        startedAt: '2026-09-20T12:00:00Z',
        finishedAt: '2026-09-20T12:01:00Z',
        evidenceIds: [],
      });
    }

    /** A project with scope approved, the given cases registered and the cases gate approved. */
    async function approvedProject(
      caseIds: readonly string[],
      extraFiles: Readonly<Record<string, string>> = {},
    ) {
      const deps = dependencies({
        fs: createFakeFileSystem({
          [CONFIG_PATH]: CONFIG_YAML,
          [join(PROJECT_ROOT, '.qa', 'artifacts', 'scope.json')]: SCOPE_JSON,
          [join(PROJECT_ROOT, '.qa', 'manifest.json')]: manifestRegistering({
            'artifacts/scope.json': SCOPE_JSON,
          }),
          ...Object.fromEntries(
            caseIds.map((id) => [join(PROJECT_ROOT, 'cases', `${id}.json`), caseJson(id)]),
          ),
          ...extraFiles,
        }),
      });
      await runCli(
        ['approve', 'scope', '--artifact', 'artifacts/scope.json', '--approved-by', 'operator'],
        deps,
      );
      for (const id of caseIds) {
        await runCli(['cases', 'add', '--path', `cases/${id}.json`], deps);
      }
      await runCli(
        ['approve', 'cases', '--artifact', 'artifacts/cases-index.json', '--approved-by', 'operator'],
        deps,
      );
      deps.stdout.length = 0;
      return deps;
    }

    it('shows the open gates and the phase to finish on a fresh project', async () => {
      const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

      const exitCode = await runCli(['status'], deps);

      expect(exitCode).toBe(EXIT_SUCCESS);
      const output = deps.stdout.join('\n');
      expect(output).toContain('[open] scope');
      expect(output).toContain('Finish the "scope" phase');
      expect(output).toContain('skill qa-start, starting with qa.scope');
    });

    it('prints machine-readable JSON with --json', async () => {
      const deps = dependencies({ fs: createFakeFileSystem({ [CONFIG_PATH]: CONFIG_YAML }) });

      await runCli(['status', '--json'], deps);

      const parsed = JSON.parse(deps.stdout[0] ?? '{}') as {
        command: string;
        data: { nextActions: { kind: string }[] };
      };
      expect(parsed.command).toBe('status');
      expect(parsed.data.nextActions.map((action) => action.kind)).toEqual(['phase']);
    });

    it('after the last gate, names exploring and executing, and how many cases are not listed', async () => {
      const ids = Array.from({ length: 12 }, (_, index) => `case-${String(index + 10)}`);
      const deps = await approvedProject(ids);

      await runCli(['status'], deps);

      const output = deps.stdout.join('\n');
      expect(output).toContain('Explore the application');
      expect(output).toContain('skill qa-execute, starting with qa.browser_open');
      expect(output).toContain('cases: case-10, case-11');
      expect(output).toContain('and 2 more');
    });

    it('says nothing is left once every case has a passing result and a generated spec', async () => {
      const spec =
        "test('x', { annotation: { type: 'testCaseId', description: 'case-a' } }, async () => undefined);";
      const deps = await approvedProject(['case-a'], {
        [join(PROJECT_ROOT, '.qa', 'selectors', 'registry.json')]: '{}',
        [join(PROJECT_ROOT, '.qa', 'runs', 'case-a', 'r1.json')]: passedResultJson('r1', 'case-a'),
        [join(PROJECT_ROOT, 'tests', 'qa', 'a.spec.ts')]: spec,
      });
      const manifestPath = join(PROJECT_ROOT, '.qa', 'manifest.json');
      const manifest = JSON.parse((await deps.fs?.readFile(manifestPath)) ?? '{}') as {
        artifacts: Record<string, unknown>;
      };
      manifest.artifacts['tests/qa/a.spec.ts'] = {
        sha256: hashText(spec),
        mode: 'text',
        registeredAt: '2026-09-20T12:00:00Z',
      };
      await deps.fs?.writeFile(manifestPath, JSON.stringify(manifest));

      await runCli(['status'], deps);

      expect(deps.stdout.join('\n')).toContain('Nothing left to do');
    });

    it('lists the cases without "and N more" when all fit', async () => {
      const deps = await approvedProject(['case-a']);

      await runCli(['status'], deps);

      const output = deps.stdout.join('\n');
      expect(output).toContain('cases: case-a');
      expect(output).not.toContain('more');
    });

    it('defaults the project root to the current working directory', async () => {
      const { io, stdout } = captureIO();

      const exitCode = await runCli(['status'], { io, fs: createFakeFileSystem(), env: {} });

      expect(exitCode).toBe(EXIT_SUCCESS);
      expect(stdout.join('\n')).toContain('Finish the "scope" phase');
    });
  });
});
