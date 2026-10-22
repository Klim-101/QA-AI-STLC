// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ManifestStore,
  QaError,
  QaStore,
  configureTestIdAttribute,
  loadConfig,
  scopeOfEnvironment,
  type EnvironmentScope,
  type SafeModeRequestSummaries,
} from '@qa-ai-stlc/core';
import {
  buildRequestLogHar,
  capturePickModeElements,
  finalizeManualSelectorEntries,
  guardPickModeSession,
  isAllowedUrl,
  mergeGeneratedIdPatterns,
  persistExploreResult,
  resolveEnvironment,
  resolveComponentLibraryProfile,
  resolveIdentity,
  resolvePolicy,
  resolveStorageState,
  runExplore as runExploreOperation,
  waitForPickModeCompletion,
  type ExploreOptions as ExploreOperationOptions,
  type ExploreReport,
} from '@qa-ai-stlc/explorer';
import { type Config, type SafeNonGetRequest, type SelectorElement } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

export type { ExploreReport } from '@qa-ai-stlc/explorer';

export interface ExploreOptions extends ExploreOperationOptions {
  /** A single URL to run pick mode against instead of crawling. Not exposed over MCP. */
  readonly pick?: string;
}

interface PickModeEnvironment {
  readonly tlsInsecure: boolean;
  readonly locale?: string;
  readonly allowlist: readonly string[];
  readonly baseUrl: string;
  readonly safeRequests?: readonly SafeNonGetRequest[];
}

// Pick mode navigates to an arbitrary URL, not necessarily a configured environment's baseUrl, so
// an environment given by --environment opts pick mode into its `tlsInsecure` and its allowlist
// too, but an unresolvable one (none configured, none named -- `resolveEnvironment` only ever
// throws a QaError for those cases) leaves TLS validation on and allows only the page's own host
// rather than failing the session over something pick mode does not otherwise need.
function resolvePickModeEnvironment(
  config: Config,
  name: string | undefined,
  pickUrl: string,
): PickModeEnvironment {
  const pickOrigin = new URL(pickUrl);
  try {
    const { config: environment } = resolveEnvironment(config, name);
    if (!isAllowedUrl(pickUrl, environment.allowlist)) {
      throw new QaError(
        'explorer.pick_mode.url_not_allowed',
        `"${pickUrl}" is not on the environment allowlist (${environment.allowlist.join(', ')})`,
        { remediation: 'Pick a page on an allowlisted host, or add the host to the environment allowlist.' },
      );
    }
    return {
      tlsInsecure: environment.tlsInsecure === true,
      ...(environment.locale === undefined ? {} : { locale: environment.locale }),
      allowlist: environment.allowlist,
      baseUrl: environment.baseUrl,
      ...(environment.safeNonGetRequests === undefined
        ? {}
        : { safeRequests: environment.safeNonGetRequests }),
    };
  } catch (error) {
    if (error instanceof QaError && error.code === 'explorer.pick_mode.url_not_allowed') {
      throw error;
    }
    return { tlsInsecure: false, allowlist: [pickOrigin.hostname], baseUrl: pickOrigin.origin };
  }
}

// The environment a pick-mode capture is stored under (ADR-0020). Pick mode may run against a page no
// environment names, and `resolveEnvironment` only ever throws a QaError for that case, so an
// environment that cannot be resolved leaves the capture unscoped rather than failing the session.
function resolvePickModeScope(config: Config, name: string | undefined): EnvironmentScope | undefined {
  try {
    const environment = resolveEnvironment(config, name);
    return scopeOfEnvironment(environment.name, environment.config);
  } catch {
    return undefined;
  }
}

async function runPickModeSession(
  context: CommandContext,
  options: ExploreOptions & { readonly pick: string },
): Promise<{
  elements: SelectorElement[];
  legacyElementIds: ReadonlyMap<string, string>;
  blockedRequestCount: number;
  requests: SafeModeRequestSummaries;
  scope: EnvironmentScope | undefined;
}> {
  const config = await loadConfig(context);
  const identity = resolveIdentity(context, config, options);
  const policy = resolvePolicy(config, options.policy);
  const { tlsInsecure, locale, ...guard } = resolvePickModeEnvironment(
    config,
    options.environment,
    options.pick,
  );
  configureTestIdAttribute(config.selectors.testIdAttribute);
  const storageState = await resolveStorageState(
    context.browserLauncher,
    identity,
    guard,
    tlsInsecure,
    locale,
  );

  // Headed: a human clicks the elements in this window, unlike every other launch() call here.
  const browser = await context.browserLauncher.launch({ headless: false });
  try {
    const browserContext = await browser.newContext({
      ...(storageState === undefined ? {} : { storageState }),
      ...(tlsInsecure ? { ignoreHttpsErrors: true } : {}),
      ...(locale === undefined ? {} : { locale }),
    });
    const tally = await guardPickModeSession(browserContext, guard);
    const page = await browserContext.newPage();
    await page.goto(options.pick);
    context.io.stdout(
      `Pick mode: a browser window opened at ${options.pick}. Click every element to capture, then click "Finish picking". To open a collapsed panel or menu first, switch "Browse" on, click, then switch it off again.`,
    );
    const captures = await waitForPickModeCompletion(page, {
      testIdAttribute: config.selectors.testIdAttribute,
    });
    const scope = resolvePickModeScope(config, options.environment);
    const pickModeElements = await capturePickModeElements(page, options.pick, captures, {
      ...(scope === undefined ? {} : { scope }),
      policy,
      viewports: config.selectors.stabilityViewports,
      generatedIdPatterns: mergeGeneratedIdPatterns(
        config.selectors.generatedIdPatterns,
        resolveComponentLibraryProfile(config.ui.componentLibrary),
      ),
    });
    const generatedAt = context.clock.now().toISOString();
    const elements = finalizeManualSelectorEntries(pickModeElements, new Map(), generatedAt);
    const requests = tally.summary();
    return {
      elements,
      legacyElementIds: new Map(
        pickModeElements.map((element) => [element.legacyElementId, element.elementId] as const),
      ),
      blockedRequestCount: Object.values(requests.blockedCounts).reduce((total, count) => total + count, 0),
      requests,
      scope,
    };
  } finally {
    await browser.close();
  }
}

/**
 * `qa explore`: delegates to the shared `@qa-ai-stlc/explorer` operation for crawling, static
 * analysis and `--verify` (also reachable over MCP as `qa_explore`, P2-05). `--pick <url>` stays
 * CLI-only: it opens a headed browser for a human to click through, which an agent cannot drive
 * over MCP's stdio transport, and shares only the registry/locator-module persistence tail
 * (`persistExploreResult`) with the shared operation.
 */
export async function runExplore(
  context: CommandContext,
  options: ExploreOptions = {},
): Promise<ExploreReport> {
  if (options.pick === undefined) {
    return runExploreOperation(context, options);
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const { elements, legacyElementIds, blockedRequestCount, requests, scope } = await runPickModeSession(
    context,
    {
      ...options,
      pick: options.pick,
    },
  );

  // Pick mode is a human clicking through a headed browser, not a crawl: there is no request log
  // to derive `endpoints.json` from, so an empty one is passed through the same persistence tail
  // the crawl-driven path uses.
  const emptyRequestLogHar = buildRequestLogHar([], context.clock.now().toISOString());
  return persistExploreResult(
    context,
    store,
    manifest,
    scope,
    elements,
    legacyElementIds,
    blockedRequestCount,
    emptyRequestLogHar,
    requests,
  );
}
