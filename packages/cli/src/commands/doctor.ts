// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  QaError,
  QaStore,
  SUPPORTED_BROWSERS,
  checkApiContractReadable,
  checkBaseUrlReachable,
  checkBrowserInstalled,
  checkIdentitiesPresent,
  checkNodeVersion,
  checkSourcePathReadable,
  installBrowsers,
  loadConfig,
  type DoctorCheckResult,
} from '@qa-ai-stlc/core';
import type { Config } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

export interface DoctorOptions {
  readonly fix?: boolean;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly checks: readonly DoctorCheckResult[];
}

/**
 * `qa doctor`: Node version, browser binaries, and, once a `config.yaml` exists, every
 * identity's secret and every environment's reachability (ADR-004). `--fix` installs missing
 * browsers through Playwright's own installer before reporting their final state.
 */
export async function runDoctor(context: CommandContext, options: DoctorOptions = {}): Promise<DoctorReport> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  let checks: DoctorCheckResult[] = [checkNodeVersion()];

  for (const browser of SUPPORTED_BROWSERS) {
    checks.push(await checkBrowserInstalled(context.fs, browser));
  }

  if (options.fix === true) {
    checks = await fixMissingBrowsers(context, checks);
  }

  checks = [...checks, ...(await runConfigChecks(context, store))];

  return { ok: checks.every((check) => check.status === 'pass'), checks };
}

async function fixMissingBrowsers(
  context: CommandContext,
  checks: readonly DoctorCheckResult[],
): Promise<DoctorCheckResult[]> {
  const missing = SUPPORTED_BROWSERS.filter((browser) =>
    checks.some((check) => check.name === `browser:${browser}` && check.status === 'fail'),
  );
  if (missing.length === 0) {
    return [...checks];
  }

  const installResult = await installBrowsers(context.processRunner, missing);
  const rechecked = new Map<string, DoctorCheckResult>(
    await Promise.all(
      missing.map(async (browser): Promise<readonly [string, DoctorCheckResult]> => [
        `browser:${browser}`,
        await checkBrowserInstalled(context.fs, browser),
      ]),
    ),
  );
  return [...checks.map((check) => rechecked.get(check.name) ?? check), installResult];
}

async function runConfigChecks(
  context: CommandContext,
  store: QaStore,
): Promise<readonly DoctorCheckResult[]> {
  let config: Config;
  try {
    config = await loadConfig(store);
  } catch (error) {
    if (error instanceof QaError) {
      // Every QaError `loadConfig` throws (CONFIG_MISSING, CONFIG_MALFORMED, CONFIG_INVALID)
      // sets a remediation; the cast documents that invariant instead of a defensive branch no
      // config-loader failure can actually exercise. A `!` assertion reads more naturally here,
      // but AGENTS.md 5.2 restricts those to tests.
      return [
        {
          name: 'config',
          status: 'fail',
          message: error.message,
          // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
          remediation: error.remediation as string,
        },
      ];
    }
    throw error;
  }

  const identityChecks = checkIdentitiesPresent(config.identities, context.env);
  const environmentChecks = await Promise.all(
    Object.entries(config.environments).map(async ([name, environment]) => {
      const result = await checkBaseUrlReachable(environment.baseUrl, { httpClient: context.httpClient });
      return { ...result, name: `environment:${name}` };
    }),
  );
  const sourcePathChecks = await checkSourcePathReadable(context.fs, context.projectRoot, config.source);
  const apiContractChecks = await checkApiContractReadable(context.fs, context.projectRoot, config.api, {
    httpClient: context.httpClient,
  });
  return [...identityChecks, ...environmentChecks, ...sourcePathChecks, ...apiContractChecks];
}
