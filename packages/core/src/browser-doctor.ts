// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { chromium, firefox, webkit } from 'playwright-core';
import type { ApiConfig, IdentityConfig, SourceConfig } from '@qa-ai-stlc/schemas';
import { resolveRelativePath } from './paths.js';
import type { FileSystem } from './ports/file-system.js';
import type { HttpClient } from './ports/http-client.js';
import { fetchHttpClient } from './ports/http-client.js';
import type { ProcessRunner } from './ports/process-runner.js';

export type DoctorCheckStatus = 'pass' | 'fail';

export interface DoctorCheckResult {
  readonly name: string;
  readonly status: DoctorCheckStatus;
  readonly message: string;
  readonly remediation?: string;
}

export const SUPPORTED_BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
export type SupportedBrowser = (typeof SUPPORTED_BROWSERS)[number];

const EXECUTABLE_PATH_RESOLVERS: Readonly<Record<SupportedBrowser, () => string>> = {
  chromium: () => chromium.executablePath(),
  firefox: () => firefox.executablePath(),
  webkit: () => webkit.executablePath(),
};

export function resolveBrowserExecutablePath(browser: SupportedBrowser): string {
  return EXECUTABLE_PATH_RESOLVERS[browser]();
}

// Keep in sync with the root package.json "engines.node" floor (AGENTS.md 5.1); there is no
// single runtime source both a packaged CLI and this check can share.
const MIN_NODE_VERSION = { major: 22, minor: 12, patch: 0 } as const;

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function isAtLeast(version: ParsedVersion, floor: ParsedVersion): boolean {
  if (version.major !== floor.major) {
    return version.major > floor.major;
  }
  if (version.minor !== floor.minor) {
    return version.minor > floor.minor;
  }
  return version.patch >= floor.patch;
}

/** Checks the running Node version against the framework's documented floor (ADR-004). */
export function checkNodeVersion(currentVersion: string = process.version): DoctorCheckResult {
  const floorLabel = [MIN_NODE_VERSION.major, MIN_NODE_VERSION.minor, MIN_NODE_VERSION.patch].join('.');
  const parsed = parseVersion(currentVersion);
  if (parsed === undefined) {
    return {
      name: 'node-version',
      status: 'fail',
      message: `Could not parse Node version "${currentVersion}"`,
      remediation: `Install Node >=${floorLabel}.`,
    };
  }
  if (!isAtLeast(parsed, MIN_NODE_VERSION)) {
    return {
      name: 'node-version',
      status: 'fail',
      message: `Node ${currentVersion} is older than the required ${floorLabel}`,
      remediation: `Install Node >=${floorLabel}.`,
    };
  }
  return {
    name: 'node-version',
    status: 'pass',
    message: `Node ${currentVersion} satisfies >=${floorLabel}`,
  };
}

/** Checks whether a browser Playwright owns (ADR-004) is actually present on disk. */
export async function checkBrowserInstalled(
  fs: FileSystem,
  browser: SupportedBrowser,
): Promise<DoctorCheckResult> {
  const executablePath = resolveBrowserExecutablePath(browser);
  const installed = await fs.pathExists(executablePath);
  return installed
    ? { name: `browser:${browser}`, status: 'pass', message: `${browser} is installed` }
    : {
        name: `browser:${browser}`,
        status: 'fail',
        message: `${browser} is not installed`,
        remediation: `Run "qa doctor --fix" to install it, or "npx playwright install ${browser}".`,
      };
}

export interface CheckBaseUrlOptions {
  readonly httpClient?: HttpClient;
  readonly timeoutMs?: number;
  /** Bypasses TLS certificate validation for this check (P2-18); off by default. */
  readonly tlsInsecure?: boolean;
}

/** Checks that the configured environment's base URL responds at all (ADR-004, section 2.7 step 2). */
export async function checkBaseUrlReachable(
  baseUrl: string,
  options: CheckBaseUrlOptions = {},
): Promise<DoctorCheckResult> {
  const httpClient = options.httpClient ?? fetchHttpClient;
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await httpClient.get(baseUrl, { signal: controller.signal, tlsInsecure: options.tlsInsecure === true });
    return { name: 'base-url', status: 'pass', message: `${baseUrl} is reachable` };
  } catch {
    return {
      name: 'base-url',
      status: 'fail',
      message: `${baseUrl} is not reachable`,
      remediation: 'Check the environment is running and the configured baseUrl is correct.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Checks that every configured identity's secret environment variable is actually set. */
export function checkIdentitiesPresent(
  identities: Readonly<Record<string, IdentityConfig>>,
  env: Readonly<Record<string, string | undefined>>,
): readonly DoctorCheckResult[] {
  return Object.entries(identities).map(([name, identity]) => {
    const value = env[identity.secret];
    return value !== undefined && value !== ''
      ? { name: `identity:${name}`, status: 'pass' as const, message: `${identity.secret} is set` }
      : {
          name: `identity:${name}`,
          status: 'fail' as const,
          message: `${identity.secret} is not set`,
          remediation: `Set the ${identity.secret} environment variable before using identity "${name}".`,
        };
  });
}

/** Checks that a configured `source.path` (P1-18) resolves to something readable. */
export async function checkSourcePathReadable(
  fs: FileSystem,
  projectRoot: string,
  source: SourceConfig | undefined,
): Promise<readonly DoctorCheckResult[]> {
  if (source === undefined) {
    return [];
  }
  const exists = await fs.pathExists(resolveRelativePath(projectRoot, source.path));
  return [
    exists
      ? { name: 'source-path', status: 'pass', message: `${source.path} is readable` }
      : {
          name: 'source-path',
          status: 'fail',
          message: `${source.path} does not exist`,
          remediation: 'Check source.path in config.yaml points at a real, readable checkout.',
        },
  ];
}

const URL_SCHEME = /^https?:\/\//;

export interface CheckApiContractOptions {
  readonly httpClient?: HttpClient;
  readonly timeoutMs?: number;
}

/**
 * Checks that a configured `api.source` (P1-18) is reachable: a URL is checked over HTTP, a local
 * path is checked for existence under the project root. `"discover"` and `"synthesize"` are not
 * files or URLs at all — the explorer resolves those at run time — so neither is checked here.
 */
export async function checkApiContractReadable(
  fs: FileSystem,
  projectRoot: string,
  api: ApiConfig | undefined,
  options: CheckApiContractOptions = {},
): Promise<readonly DoctorCheckResult[]> {
  if (api === undefined || api.source === 'discover' || api.source === 'synthesize') {
    return [];
  }
  if (URL_SCHEME.test(api.source)) {
    const result = await checkBaseUrlReachable(api.source, options);
    return [{ ...result, name: 'api-contract' }];
  }
  const exists = await fs.pathExists(resolveRelativePath(projectRoot, api.source));
  return [
    exists
      ? { name: 'api-contract', status: 'pass', message: `${api.source} is readable` }
      : {
          name: 'api-contract',
          status: 'fail',
          message: `${api.source} does not exist`,
          remediation: 'Check api.source in config.yaml points at a real, readable contract file or URL.',
        },
  ];
}

// The full `playwright` package (its installer CLI, not just the `playwright-core` runtime this
// module otherwise depends on) is fetched on demand via `npx` rather than kept as a direct
// dependency (#333): every `@qa-ai-stlc/mcp-server` install otherwise paid for it on every cold
// start, even though `qa doctor --fix` (the only caller of `installBrowsers`) is a rare, explicit
// operator action. Pinned to the exact version `playwright-core` in this package's own
// package.json is pinned to, so the installed browsers match the protocol version this engine was
// built against.
const PLAYWRIGHT_CLI_VERSION = '1.63.0';

/** `qa doctor --fix`: installs the given browsers through Playwright's own installer. */
export async function installBrowsers(
  processRunner: ProcessRunner,
  browsers: readonly SupportedBrowser[] = SUPPORTED_BROWSERS,
): Promise<DoctorCheckResult> {
  const result = await processRunner.run('npx', [
    '-y',
    `playwright@${PLAYWRIGHT_CLI_VERSION}`,
    'install',
    ...browsers,
  ]);
  return result.exitCode === 0
    ? { name: 'browser-install', status: 'pass', message: `Installed: ${browsers.join(', ')}` }
    : {
        name: 'browser-install',
        status: 'fail',
        message: `Installing browsers failed with exit code ${String(result.exitCode)}`,
        remediation:
          result.stderr.trim() || 'Run "npx playwright install" manually and check network access.',
      };
}
