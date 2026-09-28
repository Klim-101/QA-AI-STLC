// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@qa-ai-stlc/schemas';
import {
  SUPPORTED_BROWSERS,
  checkApiContractReadable,
  checkBaseUrlReachable,
  checkBrowserInstalled,
  checkIdentitiesPresent,
  checkNodeVersion,
  checkSourcePathReadable,
  installBrowsers,
  type DoctorCheckResult,
} from '../browser-doctor.js';
import type { ConfigRelaxation } from '../config-layers.js';
import { loadLayeredConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';

export interface DoctorOptions {
  readonly fix?: boolean;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly checks: readonly DoctorCheckResult[];
  /** Every relaxation the local configuration layer introduces (ADR-011), regardless of `ok`. */
  readonly relaxations: readonly ConfigRelaxation[];
}

/**
 * `qa doctor` / MCP `qa_doctor` (P2-05): Node version, browser binaries, and, once a
 * `config.yaml` exists, every identity's secret and every environment's reachability (ADR-004),
 * plus every relaxation the local configuration layer introduces (ADR-011) — this is the one
 * check every `qa-start` session runs first, so it is where a widened allowlist or a disabled
 * TLS check must be impossible to miss. `--fix` installs missing browsers through Playwright's
 * own installer before reporting their final state.
 */
export async function runDoctor(context: EngineContext, options: DoctorOptions = {}): Promise<DoctorReport> {
  let checks: DoctorCheckResult[] = [checkNodeVersion()];

  for (const browser of SUPPORTED_BROWSERS) {
    checks.push(await checkBrowserInstalled(context.fs, browser));
  }

  if (options.fix === true) {
    checks = await fixMissingBrowsers(context, checks);
  }

  const configResult = await runConfigChecks(context);
  checks = [...checks, ...configResult.checks];

  return {
    ok: checks.every((check) => check.status === 'pass'),
    checks,
    relaxations: configResult.relaxations,
  };
}

async function fixMissingBrowsers(
  context: EngineContext,
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

interface ConfigCheckResult {
  readonly checks: readonly DoctorCheckResult[];
  readonly relaxations: readonly ConfigRelaxation[];
}

async function runConfigChecks(context: EngineContext): Promise<ConfigCheckResult> {
  let config: Config;
  let relaxations: readonly ConfigRelaxation[];
  try {
    ({ config, relaxations } = await loadLayeredConfig(context));
  } catch (error) {
    if (error instanceof QaError) {
      // Every QaError `loadLayeredConfig` throws (CONFIG_MISSING, CONFIG_MALFORMED, CONFIG_INVALID,
      // CONFIG_LOCAL_MISSING, CONFIG_OVERRIDE_NOT_ALLOWED) sets a remediation; the cast documents that invariant instead of a defensive branch no
      // config-loader failure can actually exercise. A `!` assertion reads more naturally here,
      // but AGENTS.md 5.2 restricts those to tests.
      return {
        checks: [
          {
            name: 'config',
            status: 'fail',
            message: error.message,
            // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
            remediation: error.remediation as string,
          },
        ],
        relaxations: [],
      };
    }
    throw error;
  }

  const identityChecks = checkIdentitiesPresent(config.identities, context.env);
  const environmentChecks = await Promise.all(
    Object.entries(config.environments).map(async ([name, environment]) => {
      if (environment.tlsInsecure === true) {
        context.logger.warn(`TLS certificate validation is disabled for environment "${name}"`, {
          code: 'ENVIRONMENT_TLS_INSECURE',
          environment: name,
        });
      }
      const result = await checkBaseUrlReachable(environment.baseUrl, {
        httpClient: context.httpClient,
        tlsInsecure: environment.tlsInsecure === true,
      });
      return { ...result, name: `environment:${name}` };
    }),
  );
  const sourcePathChecks = await checkSourcePathReadable(context.fs, context.projectRoot, config.source);
  const apiContractChecks = await checkApiContractReadable(context.fs, context.projectRoot, config.api, {
    httpClient: context.httpClient,
  });
  return {
    checks: [...identityChecks, ...environmentChecks, ...sourcePathChecks, ...apiContractChecks],
    relaxations,
  };
}
