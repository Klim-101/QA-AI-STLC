// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ManifestStore,
  QaError,
  QaStore,
  loadConfig,
  resolveRelativePath,
  toRelativePath,
  type FileSystem,
} from '@qa-ai-stlc/core';
import {
  analyzePages,
  analyzeStaticSource,
  buildMissingTestIdReport,
  buildSelectorRegistry,
  capturePickModeElements,
  crawl,
  diffSelectorRegistry,
  finalizeManualSelectorEntries,
  generateLocatorModule,
  injectPickModeOverlay,
  mergeSelectorRegistry,
  resolveStorageState,
  scoreLocatorStability,
  waitForPickModeCompletion,
  type DegradedSelectorElement,
  type ExplorerIdentity,
  type StaticSourceFile,
} from '@qa-ai-stlc/explorer';
import {
  SCHEMA_VERSION,
  SelectorPolicySchema,
  SelectorRegistrySchema,
  type Config,
  type EnvironmentConfig,
  type SelectorElement,
  type SelectorPolicy,
  type SelectorRegistry,
} from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';
import { readPackageVersion } from '../package-version.js';

const REGISTRY_PATH = 'selectors/registry.json';
const MISSING_TEST_ID_REPORT_PATH = 'selectors/missing-test-ids.json';
const LOCATOR_MODULE_PATH = 'tests/qa/locators.ts';

// EJS is included alongside the three frameworks the development plan names (React/Angular/Vue):
// its templates are plain HTML, the same literal-attribute shape analyzeStaticSource looks for in
// any of the three, and the demo app (the only fixture this command is validated against) is
// server-rendered EJS.
const STATIC_SOURCE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js', '.vue', '.html', '.ejs'];

export interface ExploreOptions {
  readonly environment?: string;
  readonly identity?: string;
  readonly cdpEndpointUrl?: string;
  readonly policy?: string;
  readonly static?: boolean;
  /** A single URL to run pick mode against instead of crawling. */
  readonly pick?: string;
  readonly maxPages?: number;
  /** Re-checks the stored registry's candidates live instead of building a new one. */
  readonly verify?: boolean;
}

export interface ExploreReport {
  readonly mode: 'explore' | 'verify';
  readonly registryPath: string;
  readonly elementCount: number;
  readonly added: number;
  readonly removed: number;
  readonly degraded: readonly DegradedSelectorElement[];
  readonly missingLocatorCount: number;
  readonly blockedRequestCount: number;
}

function resolvePolicy(config: Config, given: string | undefined): SelectorPolicy {
  if (given === undefined) {
    return config.selectors.policy;
  }
  const result = SelectorPolicySchema.safeParse(given);
  if (!result.success) {
    throw new QaError('EXPLORE_POLICY_INVALID', `"${given}" is not a known selector policy`, {
      remediation: `Use one of: ${SelectorPolicySchema.options.join(', ')}.`,
    });
  }
  return result.data;
}

function resolveEnvironment(
  config: Config,
  name: string | undefined,
): { readonly name: string; readonly config: EnvironmentConfig } {
  const names = Object.keys(config.environments);
  if (name !== undefined) {
    const environment = config.environments[name];
    if (environment === undefined) {
      throw new QaError('EXPLORE_ENVIRONMENT_UNKNOWN', `No environment named "${name}" in config.yaml`, {
        remediation: `Use one of: ${names.join(', ')}.`,
      });
    }
    return { name, config: environment };
  }
  const [onlyEntry] = Object.entries(config.environments);
  if (names.length === 1 && onlyEntry !== undefined) {
    const [onlyName, onlyEnvironment] = onlyEntry;
    return { name: onlyName, config: onlyEnvironment };
  }
  throw new QaError(
    'EXPLORE_ENVIRONMENT_AMBIGUOUS',
    names.length === 0
      ? 'config.yaml defines no environments'
      : 'No --environment given and config.yaml defines more than one',
    {
      remediation:
        names.length === 0
          ? 'Add an environment to config.yaml.'
          : `Pass --environment, one of: ${names.join(', ')}.`,
    },
  );
}

function resolveIdentity(
  context: CommandContext,
  config: Config,
  options: ExploreOptions,
): ExplorerIdentity | undefined {
  if (options.identity === undefined) {
    return undefined;
  }
  const identityConfig = config.identities[options.identity];
  if (identityConfig === undefined) {
    throw new QaError('EXPLORE_IDENTITY_UNKNOWN', `No identity named "${options.identity}" in config.yaml`, {
      remediation: `Use one of: ${Object.keys(config.identities).join(', ')}.`,
    });
  }
  return {
    config: identityConfig,
    env: context.env,
    ...(options.cdpEndpointUrl !== undefined ? { cdpEndpointUrl: options.cdpEndpointUrl } : {}),
  };
}

async function readStaticSourceFiles(
  fs: FileSystem,
  projectRoot: string,
  sourcePath: string,
): Promise<StaticSourceFile[]> {
  const absoluteSourceDir = resolveRelativePath(projectRoot, sourcePath);
  const absolutePaths = (await fs.listFiles(absoluteSourceDir)).filter((path) =>
    STATIC_SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)),
  );
  return Promise.all(
    absolutePaths.map(async (absolutePath) => ({
      filePath: toRelativePath(projectRoot, absolutePath),
      content: await fs.readFile(absolutePath),
    })),
  );
}

async function runCrawlAndBuild(
  context: CommandContext,
  config: Config,
  options: ExploreOptions,
): Promise<{ elements: SelectorElement[]; blockedRequestCount: number }> {
  const environment = resolveEnvironment(config, options.environment);
  const identity = resolveIdentity(context, config, options);
  const policy = resolvePolicy(config, options.policy);

  const crawlResult = await crawl({
    startUrl: environment.config.baseUrl,
    allowlist: environment.config.allowlist,
    browserLauncher: context.browserLauncher,
    ...(identity !== undefined ? { identity } : {}),
    ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
  });
  const urls = crawlResult.routeMap.routes.map((route) => route.url);
  const { pageModelSet, blockedRequestCount: analyzeBlocked } = await analyzePages({
    urls,
    browserLauncher: context.browserLauncher,
    ...(identity !== undefined ? { identity } : {}),
  });
  const { registry, blockedRequestCount: buildBlocked } = await buildSelectorRegistry({
    pageModelSet,
    browserLauncher: context.browserLauncher,
    ...(identity !== undefined ? { identity } : {}),
    policy,
  });

  const elements: SelectorElement[] = [...registry.elements];
  if (options.static === true) {
    if (config.source === undefined) {
      throw new QaError(
        'EXPLORE_STATIC_SOURCE_MISSING',
        '--static was given but config.yaml has no source.path',
        {
          remediation: 'Set source.path in config.yaml to the application checkout to scan.',
        },
      );
    }
    const files = await readStaticSourceFiles(context.fs, context.projectRoot, config.source.path);
    elements.push(...analyzeStaticSource({ files, clock: context.clock }).elements);
  }

  return {
    elements,
    blockedRequestCount: crawlResult.blockedRequestCount + analyzeBlocked + buildBlocked,
  };
}

async function runPickModeSession(
  context: CommandContext,
  config: Config,
  options: ExploreOptions & { readonly pick: string },
): Promise<{ elements: SelectorElement[]; blockedRequestCount: number }> {
  const identity = resolveIdentity(context, config, options);
  const policy = resolvePolicy(config, options.policy);
  const storageState = await resolveStorageState(context.browserLauncher, identity);

  const browser = await context.browserLauncher.launch();
  try {
    const browserContext = await browser.newContext(storageState === undefined ? {} : { storageState });
    const page = await browserContext.newPage();
    await page.goto(options.pick);
    await injectPickModeOverlay(page);
    context.io.stdout(
      `Pick mode: a browser window opened at ${options.pick}. Click every element to capture, then click "Finish picking".`,
    );
    const captures = await waitForPickModeCompletion(page);
    const pickModeElements = await capturePickModeElements(page, options.pick, captures, { policy });
    const generatedAt = context.clock.now().toISOString();
    const elements = finalizeManualSelectorEntries(pickModeElements, new Map(), generatedAt);
    return { elements, blockedRequestCount: 0 };
  } finally {
    await browser.close();
  }
}

async function runVerify(
  context: CommandContext,
  store: QaStore,
  config: Config,
  options: ExploreOptions,
): Promise<ExploreReport> {
  const exists = await store.pathExists(REGISTRY_PATH);
  if (!exists) {
    throw new QaError('EXPLORE_NO_REGISTRY', 'No selector registry found to verify', {
      remediation: 'Run "qa explore" first to build a registry.',
    });
  }
  const stored = await store.readJson(REGISTRY_PATH, SelectorRegistrySchema);
  const identity = resolveIdentity(context, config, options);
  const storageState = await resolveStorageState(context.browserLauncher, identity);

  const checkable = stored.elements.filter(
    (element) =>
      element.deprecatedAt === undefined &&
      element.pageUrl !== undefined &&
      element.locatorCandidates.length > 0,
  );
  const elementsByPageUrl = new Map<string, SelectorElement[]>();
  for (const element of checkable) {
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- filtered above
    const pageUrl = element.pageUrl as string;
    const group = elementsByPageUrl.get(pageUrl);
    if (group === undefined) {
      elementsByPageUrl.set(pageUrl, [element]);
    } else {
      group.push(element);
    }
  }

  const degraded: DegradedSelectorElement[] = [];
  const browser = await context.browserLauncher.launch();
  try {
    const browserContext = await browser.newContext(storageState === undefined ? {} : { storageState });
    const page = await browserContext.newPage();
    for (const [pageUrl, elements] of elementsByPageUrl) {
      await page.goto(pageUrl);
      for (const element of elements) {
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- filtered above
        const primary = element.locatorCandidates[0] as SelectorElement['locatorCandidates'][number];
        const currentScore = await scoreLocatorStability(page, primary);
        if (currentScore < element.stabilityScore) {
          degraded.push({
            elementId: element.elementId,
            previousScore: element.stabilityScore,
            currentScore,
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const missingLocatorCount = generateLocatorModule(stored, { generatorVersion: readPackageVersion() })
    .missingLocators.length;

  return {
    mode: 'verify',
    registryPath: REGISTRY_PATH,
    elementCount: stored.elements.length,
    added: 0,
    removed: 0,
    degraded,
    missingLocatorCount,
    blockedRequestCount: 0,
  };
}

/**
 * `qa explore`: builds the selector registry (development plan section 6.3) by crawling, then
 * merges in static source analysis (`--static`) or a manual pick-mode session (`--pick <url>`)
 * when asked, writes `.qa/selectors/registry.json`, `.qa/selectors/missing-test-ids.json` and the
 * generated `tests/qa/locators.ts`, and registers all three in the manifest. `--verify` skips
 * building anything: it re-checks every stored, non-deprecated element's primary candidate against
 * the live page it was found on and fails (`degraded` non-empty) when one no longer resolves as
 * well as it did when last recorded — the signal a stale selector (e.g. a renamed test ID) needs.
 */
export async function runExplore(
  context: CommandContext,
  options: ExploreOptions = {},
): Promise<ExploreReport> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const config = await loadConfig(store);

  if (options.verify === true) {
    return runVerify(context, store, config, options);
  }

  const previous = (await store.pathExists(REGISTRY_PATH))
    ? await store.readJson(REGISTRY_PATH, SelectorRegistrySchema)
    : undefined;

  const { elements, blockedRequestCount } =
    options.pick !== undefined
      ? await runPickModeSession(context, config, { ...options, pick: options.pick })
      : await runCrawlAndBuild(context, config, options);

  const generatedAt = context.clock.now().toISOString();
  const fresh: SelectorRegistry = { schemaVersion: SCHEMA_VERSION, generatedAt, elements };
  const merged = previous === undefined ? fresh : mergeSelectorRegistry(previous, fresh, generatedAt);

  await store.writeJson(REGISTRY_PATH, merged);
  await manifest.register(REGISTRY_PATH, JSON.stringify(merged));

  const moduleResult = generateLocatorModule(merged, { generatorVersion: readPackageVersion() });
  await context.fs.mkdir(resolveRelativePath(context.projectRoot, 'tests/qa'));
  await context.fs.writeFile(
    resolveRelativePath(context.projectRoot, LOCATOR_MODULE_PATH),
    moduleResult.source,
  );
  await manifest.register(LOCATOR_MODULE_PATH, moduleResult.source);

  const missingTestIdReport = buildMissingTestIdReport(merged);
  await store.writeJson(MISSING_TEST_ID_REPORT_PATH, missingTestIdReport);
  await manifest.register(MISSING_TEST_ID_REPORT_PATH, JSON.stringify(missingTestIdReport));

  // Diffed against the fresh, unmerged registry, not the merged one: a merge always keeps an
  // element the fresh run no longer found (deprecating it in place) rather than dropping it, so
  // diffing the merged result would never show a "removed" element at all.
  const diff =
    previous === undefined
      ? { added: fresh.elements, removed: [], degraded: [] }
      : diffSelectorRegistry(previous, fresh);

  return {
    mode: 'explore',
    registryPath: REGISTRY_PATH,
    elementCount: merged.elements.length,
    added: diff.added.length,
    removed: diff.removed.length,
    degraded: diff.degraded,
    missingLocatorCount: moduleResult.missingLocators.length,
    blockedRequestCount,
  };
}
