// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  API_AUTH_ENVIRONMENT_VARIABLE,
  assertUrlAllowed,
  collectSensitiveNames,
  createApiAuthTokenCache,
  ensureApiAuthModule,
  extractSpecApiAuthProfiles,
  loadApiContract,
  loadConfig,
  resolveApiAuth,
  withRunTokenOrigin,
  resolveBrowserEnvironment,
  scrubSecretValues,
  serializeResolvedApiAuth,
  snapshotApiContract,
  type EngineContext,
  type ResolvedApiAuth,
  type BrowserTokenOrigin,
  type Runner,
  type RunnerInput,
  type RunnerOutcome,
} from '@qa-ai-stlc/core';
import { runPlaywrightSpecs } from '@qa-ai-stlc/runner-playwright';
import type { Config } from '@qa-ai-stlc/schemas';
import { assertApiSpecsInContract } from './check-api-specs.js';

async function resolveSpecProfiles(
  engine: EngineContext,
  config: Config,
  input: RunnerInput,
): Promise<readonly ResolvedApiAuth[]> {
  const profileNames = new Set<string>();
  for (const specFile of input.specFiles) {
    extractSpecApiAuthProfiles(await engine.fs.readFile(specFile)).forEach((name) => profileNames.add(name));
  }
  if (profileNames.size === 0) {
    return [];
  }

  // A credential only goes to a host the environment's allowlist admits (ADR-0012); checked before
  // anything is resolved so no token is fetched for a run that could not use it.
  const environment = resolveBrowserEnvironment(config, input.environment);
  assertUrlAllowed(input.baseUrl, environment.config.allowlist, environment.config.baseUrl);
  const tokenCache = createApiAuthTokenCache();
  const resolveAll = async (browserTokenOrigin?: BrowserTokenOrigin): Promise<ResolvedApiAuth[]> => {
    const resolved: ResolvedApiAuth[] = [];
    for (const profileName of profileNames) {
      resolved.push(
        await resolveApiAuth(engine, {
          profileName,
          apiAuth: config.apiAuth,
          environment: environment.config,
          tokenCache,
          ...(browserTokenOrigin === undefined ? {} : { browserTokenOrigin }),
        }),
      );
    }
    return resolved;
  };

  // A token that lives in a browser session is read from a headless session the run signs in to as
  // its identity (ADR-0012), opened once for every profile of the run and closed before the specs start.
  const browserProfileName = [...profileNames].find(
    (name) => config.apiAuth.profiles[name]?.type === 'from-browser',
  );
  if (browserProfileName === undefined) {
    return resolveAll();
  }
  return withRunTokenOrigin(
    engine,
    config,
    {
      environment: input.environment,
      identity: input.identity,
      profileName: browserProfileName,
    },
    resolveAll,
  );
}

// A failed API test normally leaves a Playwright trace as its evidence, but a trace is a zip of every
// request header and cannot be scrubbed, so a run that carried a credential keeps none. The
// scrubbed failure message stands in, which keeps the rule that a failure is backed by evidence.
function scrubOutcome(outcome: RunnerOutcome, secretValues: readonly string[]): RunnerOutcome {
  const { failure } = outcome.result;
  if (failure === undefined) {
    return outcome;
  }
  const message = scrubSecretValues(failure.message, secretValues);
  return {
    result: { ...outcome.result, failure: { message } },
    evidence: outcome.evidence.length > 0 ? outcome.evidence : [{ kind: 'other', content: message }],
  };
}

/**
 * Runs `api` specs (Playwright `APIRequestContext`) through the shared Playwright mechanics after
 * checking every case against the configured contract (P6-04). Nothing is sent to the application
 * until the whole spec set passes the check; the contract text is then snapshotted into the
 * manifest so the hash the run relied on is on record.
 *
 * A spec authenticates through `apiAuth('<profile>')` (P6-35, ADR-0012). The runner resolves the
 * profiles a spec names, hands them to the Playwright process through its environment only, and
 * scrubs their values from what the run reports back.
 */
export const apiRunner: Runner = {
  testType: 'api',
  readsIdentity: true,
  async run(engine, input) {
    const config = await loadConfig(engine);
    const contract = await loadApiContract(engine, config, input.environment);
    await assertApiSpecsInContract(engine, input.specFiles, contract, collectSensitiveNames(config.apiAuth));
    await snapshotApiContract(engine, contract);
    await ensureApiAuthModule(engine, config.apiAuth);

    const resolved = await resolveSpecProfiles(engine, config, input);
    // The identity was only for reading a token above; an api spec drives no page, and handing it on
    // would sign in a second time and give the specs a browser session they never use.
    const specInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'identity')) as Omit<
      RunnerInput,
      'identity'
    >;
    if (resolved.length === 0) {
      return runPlaywrightSpecs(engine, specInput, 'api');
    }
    const outcomes = await runPlaywrightSpecs(engine, specInput, 'api', {
      env: { [API_AUTH_ENVIRONMENT_VARIABLE]: serializeResolvedApiAuth(resolved) },
      isTraceEnabled: false,
    });
    const secretValues = resolved.flatMap((auth) => auth.secretValues);
    return outcomes.map((outcome) => scrubOutcome(outcome, secretValues));
  },
};
