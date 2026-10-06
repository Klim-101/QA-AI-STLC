// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError, hashText, type EngineContext } from '@qa-ai-stlc/core';
import { ConfigSchema, SCHEMA_VERSION, type ApiSurface, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  createFakeExploreBrowserLauncher,
  type FakeExploreBrowserLauncherOptions,
} from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { SYNTHETIC_PROFILE } from '../test-support/synthetic-profile.js';
import { resolveIdentity, runExplore } from './explore.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const START_URL = 'https://staging.example.com/login';

interface ConfigOptions {
  readonly environments?: string;
  readonly identities?: string;
  readonly source?: string;
  readonly policy?: string;
  /** A raw YAML flow-mapping fragment (e.g. `stabilityViewports: [...]`), appended to `selectors`. */
  readonly extraSelectorsFields?: string;
  /** The `ui.componentLibrary` value; omitted, the config has no `ui` block. */
  readonly componentLibrary?: string;
}

function configYaml(options: ConfigOptions = {}): string {
  const extraSelectorsFields =
    options.extraSelectorsFields === undefined ? '' : `, ${options.extraSelectorsFields}`;
  return `${[
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    options.source ?? '',
    options.environments ??
      `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"] }`,
    options.identities ?? 'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    `selectors: { policy: ${options.policy ?? 'playwright-default'}, testIdAttribute: data-testid${extraSelectorsFields} }`,
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    options.componentLibrary === undefined ? '' : `ui: { componentLibrary: ${options.componentLibrary} }`,
  ]
    .filter((line) => line.length > 0)
    .join('\n')}\n`;
}

const ONE_ELEMENT = {
  interactiveElements: [
    {
      kind: 'button',
      accessibleName: 'Log in',
      testId: undefined,
      role: undefined,
      label: undefined,
      placeholder: undefined,
      htmlId: undefined,
      tagName: 'button',
      nthOfType: 1,
    },
  ],
  forms: [],
  tables: [],
  dialogs: [],
};

function fakeContext(
  browserOptions: FakeExploreBrowserLauncherOptions = {},
  configOptions?: ConfigOptions,
  extraFiles: Readonly<Record<string, string>> = {},
): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'config.yaml')]: configYaml(configOptions),
      ...extraFiles,
    }),
    clock: { now: () => new Date('2026-09-20T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeExploreBrowserLauncher(browserOptions),
    env: {},
  };
}

describe('runExplore', () => {
  it('crawls the single configured environment, builds a registry and writes every artifact', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    const report = await runExplore(context);

    expect(report).toEqual(
      expect.objectContaining({
        mode: 'explore',
        elementCount: 1,
        added: 1,
        removed: 0,
        degraded: [],
        endpointsPath: 'selectors/endpoints.json',
        endpointCount: 1,
      }),
    );
    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements).toHaveLength(1);
    expect(registry.elements[0]?.source).toBe('crawl');
    expect(registry.elements[0]?.pageUrl).toBe(START_URL);
    const locators = await context.fs.readFile(join(PROJECT_ROOT, 'tests', 'qa', 'locators.ts'));
    expect(locators).toContain('export function');
    const missingReport = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'missing-test-ids.json')),
    ) as { entries: readonly unknown[] };
    expect(missingReport.entries).toHaveLength(1);
    const endpoints = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'endpoints.json')),
    ) as ApiSurface;
    expect(endpoints.endpoints).toEqual([
      { method: 'GET', path: '/login', source: 'discovered', examples: ['/login'] },
    ]);
    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(Object.keys(manifest.artifacts)).toEqual(
      expect.arrayContaining([
        'selectors/registry.json',
        'tests/qa/locators.ts',
        'selectors/missing-test-ids.json',
        'selectors/endpoints.json',
      ]),
    );
  });

  it('registers widgets through the profile of the configured component library (P6-37)', async () => {
    const widget = {
      kind: 'widget',
      accessibleName: 'Status',
      role: 'combobox',
      tagName: 'span',
      nthOfType: 1,
      htmlId: 'syn-77',
      widgetKind: 'dropdown',
      popupId: 'syn-popup-1',
    };
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: { ...ONE_ELEMENT, interactiveElements: [widget] } }, locatorCount: 1 },
      { componentLibrary: 'kendo-jquery' },
    );

    await runExplore(context, { profiles: { 'kendo-jquery': SYNTHETIC_PROFILE } });

    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements[0]).toEqual(
      expect.objectContaining({ kind: 'dropdown', library: 'synthetic-ui', popupId: 'syn-popup-1' }),
    );
    expect(registry.elements[0]?.locatorCandidates.map((candidate) => candidate.value)).not.toContain(
      '#syn-77',
    );
  });

  it('scores candidate stability at the configured viewports (P6-23), not the hardcoded default', async () => {
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { extraSelectorsFields: 'stabilityViewports: [{ width: 400, height: 300 }]' },
    );

    await runExplore(context);

    const page = (context.browserLauncher as ReturnType<typeof createFakeExploreBrowserLauncher>).page;
    expect(page.viewportSizeCalls).toContainEqual({ width: 400, height: 300 });
    expect(page.viewportSizeCalls).not.toContainEqual({ width: 1280, height: 720 });
  });

  it('collapses crawled routes that only differ by a record id into one endpoint (P6-01)', async () => {
    const context = fakeContext({
      // `elementsByUrl` and `linksByUrl` share one fake `evaluate()` call keyed by URL (the fake
      // cannot tell an `extractPageElements()` call from an `extractLinks()` one apart), so
      // `startUrl` gets only the links entry — it is still the one page every crawl always visits.
      linksByUrl: {
        [START_URL]: ['https://staging.example.com/tasks/1', 'https://staging.example.com/tasks/2'],
      },
      locatorCount: 1,
    });

    await runExplore(context);

    const endpoints = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'endpoints.json')),
    ) as ApiSurface;
    expect(endpoints.endpoints).toContainEqual({
      method: 'GET',
      path: '/tasks/{id}',
      source: 'discovered',
      examples: ['/tasks/1', '/tasks/2'],
    });
  });

  it('merges endpoints from a second crawl onto the first instead of overwriting them', async () => {
    const context = fakeContext({
      linksByUrl: { [START_URL]: ['https://staging.example.com/tasks/1'] },
      locatorCount: 1,
    });
    await runExplore(context);

    // A plain second crawl with no `linksByUrl` only ever revisits the environment's own
    // `startUrl` (`/login`) — `/tasks/1` is not reachable from it this time, the way a route
    // that genuinely went away between two real crawls would not be either.
    const secondContext: EngineContext = {
      ...context,
      browserLauncher: createFakeExploreBrowserLauncher({ locatorCount: 1 }),
    };
    const secondReport = await runExplore(secondContext);

    const endpoints = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'endpoints.json')),
    ) as ApiSurface;
    expect(endpoints.endpoints.map((endpoint) => endpoint.path)).toEqual(['/login', '/tasks/{id}']);
    expect(secondReport.endpointCount).toBe(2);
  });

  it('registers each written artifact under its own exact on-disk content, not a differently-formatted hash (#395)', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    await runExplore(context);

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, { sha256: string }>;
    };
    const registryContent = await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json'));
    expect(manifest.artifacts['selectors/registry.json']?.sha256).toBe(hashText(registryContent));
    const missingReportContent = await context.fs.readFile(
      join(QA_DIR, 'selectors', 'missing-test-ids.json'),
    );
    expect(manifest.artifacts['selectors/missing-test-ids.json']?.sha256).toBe(
      hashText(missingReportContent),
    );
    const locatorsContent = await context.fs.readFile(join(PROJECT_ROOT, 'tests', 'qa', 'locators.ts'));
    expect(manifest.artifacts['tests/qa/locators.ts']?.sha256).toBe(hashText(locatorsContent));
  });

  it('merges a second crawl onto the first, deprecating an element the second crawl no longer finds', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });
    const first = await runExplore(context);
    expect(first.added).toBe(1);

    const secondContext: EngineContext = {
      ...context,
      browserLauncher: createFakeExploreBrowserLauncher({
        elementsByUrl: { [START_URL]: { interactiveElements: [], forms: [], tables: [], dialogs: [] } },
        locatorCount: 1,
      }),
    };

    const second = await runExplore(secondContext);

    expect(second.added).toBe(0);
    expect(second.removed).toBe(1);
    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements.some((element) => element.deprecatedAt !== undefined)).toBe(true);
  });

  it('throws EXPLORE_ENVIRONMENT_UNKNOWN for an --environment not in config.yaml', async () => {
    const context = fakeContext();

    await expect(runExplore(context, { environment: 'nope' })).rejects.toThrow(QaError);
  });

  it('throws EXPLORE_ENVIRONMENT_AMBIGUOUS when no --environment is given and config.yaml has none', async () => {
    const context = fakeContext({}, { environments: 'environments: {}' });

    await expect(runExplore(context)).rejects.toThrow('config.yaml defines no environments');
  });

  it('throws EXPLORE_ENVIRONMENT_AMBIGUOUS when no --environment is given and config.yaml has several', async () => {
    const context = fakeContext(
      {},
      {
        environments:
          'environments:\n  staging: { baseUrl: "https://a.example.com", allowlist: ["a.example.com"] }\n  prod: { baseUrl: "https://b.example.com", allowlist: ["b.example.com"] }',
      },
    );

    await expect(runExplore(context)).rejects.toThrow('more than one');
  });

  it('throws EXPLORE_IDENTITY_UNKNOWN for an --identity not in config.yaml', async () => {
    const context = fakeContext();

    await expect(runExplore(context, { identity: 'nope' })).rejects.toThrow(QaError);
  });

  it('signs in with a configured storage-state identity before crawling', async () => {
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      {
        identities:
          'identities:\n  admin: { auth: storage-state, secret: QA_ADMIN_PASSWORD, loginUrl: "https://staging.example.com/login", username: "admin@example.com" }',
      },
    );
    const contextWithSecret: EngineContext = { ...context, env: { QA_ADMIN_PASSWORD: 'secret' } };

    const report = await runExplore(contextWithSecret, { identity: 'admin' });

    expect(report.elementCount).toBe(1);
  });

  it('signs in over CDP when a configured identity uses cdp-attach', async () => {
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { identities: 'identities:\n  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }' },
    );

    const report = await runExplore(context, { identity: 'admin', cdpEndpointUrl: 'ws://localhost:9222' });

    expect(report.elementCount).toBe(1);
  });

  it('rejects an unknown --policy value', async () => {
    const context = fakeContext();

    await expect(runExplore(context, { policy: 'not-a-policy' })).rejects.toThrow(QaError);
  });

  describe('resolveIdentity', () => {
    function minimalConfig(overrides: Partial<{ selectors: Record<string, unknown> }> = {}) {
      return ConfigSchema.parse({
        testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
        environments: {},
        identities: {
          admin: { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' },
          custom: {
            auth: 'cdp-attach',
            secret: 'QA_CUSTOM_PASSWORD',
            selectors: { username: '#custom-username' },
          },
        },
        data: { strategy: 'manual', ownerMarker: 'qa' },
        selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid', ...overrides.selectors },
        agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 },
      });
    }

    it('falls back to config.selectors.defaultLoginSelectors when the identity sets none (P6-23)', () => {
      const config = minimalConfig();
      const context = fakeContext();

      const identity = resolveIdentity(context, config, { identity: 'admin' });

      expect(identity?.config.selectors).toStrictEqual(config.selectors.defaultLoginSelectors);
    });

    it("keeps the identity's own selector and only fills the fields it omits", () => {
      const config = minimalConfig();
      const context = fakeContext();

      const identity = resolveIdentity(context, config, { identity: 'custom' });

      expect(identity?.config.selectors).toStrictEqual({
        username: '#custom-username',
        password: config.selectors.defaultLoginSelectors.password,
        submit: config.selectors.defaultLoginSelectors.submit,
      });
    });

    it('honors a project-wide override of the default login selectors', () => {
      const config = minimalConfig({
        selectors: { defaultLoginSelectors: { username: '#u', password: '#p', submit: '#s' } },
      });
      const context = fakeContext();

      const identity = resolveIdentity(context, config, { identity: 'admin' });

      expect(identity?.config.selectors).toStrictEqual({ username: '#u', password: '#p', submit: '#s' });
    });
  });

  it('uses config.yaml selectors.policy when no --policy override is given', async () => {
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { policy: 'testid-first' },
    );

    const report = await runExplore(context);

    expect(report.elementCount).toBe(1);
  });

  it('uses a --policy override instead of config.yaml selectors.policy', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    const report = await runExplore(context, { policy: 'testid-first' });

    expect(report.elementCount).toBe(1);
  });

  it('crawls the environment named by an explicit --environment', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    const report = await runExplore(context, { environment: 'staging' });

    expect(report.elementCount).toBe(1);
  });

  it('caps the crawl at --max-pages', async () => {
    const context = fakeContext({
      elementsByUrl: { [START_URL]: ONE_ELEMENT },
      linksByUrl: { [START_URL]: ['https://staging.example.com/other'] },
      locatorCount: 1,
    });

    const report = await runExplore(context, { maxPages: 1 });

    expect(report.elementCount).toBe(1);
  });

  it('throws EXPLORE_STATIC_SOURCE_MISSING when --static is given but config.yaml has no source.path', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    await expect(runExplore(context, { static: true })).rejects.toThrow(QaError);
  });

  it('merges static source analysis findings when --static is given', async () => {
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { source: 'source: { path: app-src }' },
      {
        [join(PROJECT_ROOT, 'app-src', 'Login.tsx')]: '<button data-testid="submit">Submit</button>',
        [join(PROJECT_ROOT, 'app-src', 'README.md')]: 'not scanned: wrong extension',
      },
    );

    const report = await runExplore(context, { static: true });

    expect(report.elementCount).toBe(2);
    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements.some((element) => element.source === 'static')).toBe(true);
  });

  it('launches a crawl headless, unlike pick mode', async () => {
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });
    const launcher = context.browserLauncher as ReturnType<typeof createFakeExploreBrowserLauncher>;

    await runExplore(context);

    expect(launcher.launchCalls).not.toContainEqual({ headless: false });
  });

  it('verifies with an identity, signing in over CDP before checking stored candidates', async () => {
    const context = fakeContext(
      { locatorCount: 1, authStorageState: { cookies: [], origins: [] } },
      { identities: 'identities:\n  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }' },
      { [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()) },
    );

    const report = await runExplore(context, {
      verify: true,
      identity: 'admin',
      cdpEndpointUrl: 'ws://localhost:9222',
    });

    expect(report).toEqual(expect.objectContaining({ mode: 'verify', degraded: [] }));
  });

  it('warns when the crawled environment has tlsInsecure enabled (P2-18)', async () => {
    const warn = vi.fn();
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      {
        environments: `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"], tlsInsecure: true }`,
      },
    );
    context.logger.warn = warn;

    await runExplore(context);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('staging'),
      expect.objectContaining({ code: 'ENVIRONMENT_TLS_INSECURE', environment: 'staging' }),
    );
  });

  it('warns when the verified environment has tlsInsecure enabled (P2-18)', async () => {
    const warn = vi.fn();
    const context = fakeContext(
      { locatorCount: 1 },
      {
        environments: `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"], tlsInsecure: true }`,
      },
      { [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()) },
    );
    context.logger.warn = warn;

    await runExplore(context, { verify: true });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('staging'),
      expect.objectContaining({ code: 'ENVIRONMENT_TLS_INSECURE', environment: 'staging' }),
    );
  });

  it('warns when the crawl visits 0 pages because baseUrl is not on the allowlist (#329)', async () => {
    const warn = vi.fn();
    const context = fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      {
        environments: `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["not-the-real-host.example.com"] }`,
      },
    );
    context.logger.warn = warn;

    const report = await runExplore(context);

    expect(report).toEqual(expect.objectContaining({ elementCount: 0 }));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not-the-real-host.example.com'),
      expect.objectContaining({ code: 'EXPLORE_START_URL_NOT_ALLOWED', environment: 'staging' }),
    );
  });

  it('does not warn about the allowlist when the crawl visits at least one page', async () => {
    const warn = vi.fn();
    const context = fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });
    context.logger.warn = warn;

    await runExplore(context);

    expect(warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'EXPLORE_START_URL_NOT_ALLOWED' }),
    );
  });

  it('throws EXPLORE_NO_REGISTRY when --verify is given but no registry has been built yet', async () => {
    const context = fakeContext();

    await expect(runExplore(context, { verify: true })).rejects.toThrow(QaError);
  });

  it('reports no degraded selectors when every stored candidate still resolves as well as before', async () => {
    const context = fakeContext({ locatorCount: 1 }, undefined, {
      [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()),
    });

    const report = await runExplore(context, { verify: true });

    expect(report).toEqual(expect.objectContaining({ mode: 'verify', elementCount: 1, degraded: [] }));
  });

  it('reports 0 endpoints when verifying and no endpoints.json has ever been written', async () => {
    const context = fakeContext({ locatorCount: 1 }, undefined, {
      [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()),
    });

    const report = await runExplore(context, { verify: true });

    expect(report).toEqual(
      expect.objectContaining({ endpointsPath: 'selectors/endpoints.json', endpointCount: 0 }),
    );
  });

  it('reads the stored endpoint count when verifying', async () => {
    const context = fakeContext({ locatorCount: 1 }, undefined, {
      [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()),
      [join(QA_DIR, 'selectors', 'endpoints.json')]: JSON.stringify(storedApiSurface()),
    });

    const report = await runExplore(context, { verify: true });

    expect(report.endpointCount).toBe(1);
  });

  it('reports a degraded selector when a stored candidate no longer resolves (a renamed test ID)', async () => {
    const context = fakeContext({ locatorCount: 0 }, undefined, {
      [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()),
    });

    const report = await runExplore(context, { verify: true });

    expect(report.degraded).toEqual([{ elementId: 'el-1', previousScore: 1, currentScore: 0 }]);
  });

  it('checks every element sharing the same page, not just the first', async () => {
    const registry: SelectorRegistry = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-09-18T00:00:00Z',
      elements: [
        { ...storedElement(), elementId: 'el-1' },
        { ...storedElement(), elementId: 'el-2' },
      ],
    };
    const context = fakeContext({ locatorCount: 0 }, undefined, {
      [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(registry),
    });

    const report = await runExplore(context, { verify: true });

    expect(report.degraded.map((element) => element.elementId).sort()).toEqual(['el-1', 'el-2']);
  });

  it('runs --verify under safe mode and reports non-GET subrequests it blocked (regression, #280)', async () => {
    const context = fakeContext(
      {
        locatorCount: 1,
        subRequestsByUrl: {
          [START_URL]: [{ method: 'POST', url: 'https://staging.example.com/analytics' }],
        },
      },
      undefined,
      { [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()) },
    );

    const report = await runExplore(context, { verify: true });

    expect(report.blockedRequestCount).toBe(1);
  });

  it('runs --verify under safe mode and blocks a GET subrequest off the domain allowlist (regression, #306)', async () => {
    const context = fakeContext(
      {
        locatorCount: 1,
        subRequestsByUrl: {
          [START_URL]: [{ method: 'GET', url: 'https://evil.example.com/tracker.js' }],
        },
      },
      undefined,
      { [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()) },
    );

    const report = await runExplore(context, { verify: true });

    expect(report.blockedRequestCount).toBe(1);
  });

  it('skips a deprecated element, one with no pageUrl and one with no locator candidate when verifying', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { pageUrl, ...elementWithoutPageUrl } = storedElement();
    const registry: SelectorRegistry = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-09-18T00:00:00Z',
      elements: [
        { ...storedElement(), elementId: 'deprecated', deprecatedAt: '2026-09-18T00:00:00Z' },
        { ...elementWithoutPageUrl, elementId: 'no-page-url' },
        { ...storedElement(), elementId: 'no-candidate', locatorCandidates: [] },
      ],
    };
    const context = fakeContext({ locatorCount: 0 }, undefined, {
      [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(registry),
    });

    const report = await runExplore(context, { verify: true });

    expect(report.degraded).toEqual([]);
  });

  describe('safeNonGetRequests (ADR-0014)', () => {
    const SAFE_ENVIRONMENTS = `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"], safeNonGetRequests: [{ method: POST, path: /auth/refresh-token, reason: "Exchanges the refresh cookie." }] }`;
    const SUBREQUESTS = {
      [START_URL]: [
        { method: 'POST', url: 'https://staging.example.com/auth/refresh-token' },
        { method: 'POST', url: 'https://staging.example.com/orders?token=secret' },
      ],
    };

    it('reports what the environment let through and what it blocked, by method and path', async () => {
      const context = fakeContext(
        { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1, subRequestsByUrl: SUBREQUESTS },
        { environments: SAFE_ENVIRONMENTS },
      );

      const report = await runExplore(context);

      // Every phase of the exploration (crawl, analysis, scoring) loads the page, so each request recurs
      // (and the fake page keeps the handlers of earlier phases, so the counts are not the point).
      expect(report.allowedRequests).toEqual([
        { method: 'POST', path: '/auth/refresh-token', count: expect.any(Number) as number },
      ]);
      expect(report.blockedRequests).toEqual([
        { method: 'POST', path: '/orders', count: expect.any(Number) as number },
      ]);
      expect(JSON.stringify(report)).not.toContain('secret');
    });

    it('lets nothing through, and reports it, when the environment lists nothing', async () => {
      const context = fakeContext({
        elementsByUrl: { [START_URL]: ONE_ELEMENT },
        locatorCount: 1,
        subRequestsByUrl: SUBREQUESTS,
      });

      const report = await runExplore(context);

      expect(report.allowedRequests).toEqual([]);
      expect(report.blockedRequests.map((entry) => entry.path)).toEqual(['/auth/refresh-token', '/orders']);
    });

    it('applies the list to --verify as well', async () => {
      const context = fakeContext(
        { locatorCount: 1, subRequestsByUrl: SUBREQUESTS },
        { environments: SAFE_ENVIRONMENTS },
        { [join(QA_DIR, 'selectors', 'registry.json')]: JSON.stringify(storedRegistry()) },
      );

      const report = await runExplore(context, { verify: true });

      expect(report.allowedRequests).toEqual([{ method: 'POST', path: '/auth/refresh-token', count: 1 }]);
      expect(report.blockedRequests).toEqual([{ method: 'POST', path: '/orders', count: 1 }]);
    });
  });
});

function storedElement(): SelectorRegistry['elements'][number] {
  return {
    elementId: 'el-1',
    name: 'logIn',
    kind: 'button',
    locatorCandidates: [{ strategy: 'testId', value: 'login-submit', fragile: false }],
    stabilityScore: 1,
    lastVerifiedAt: '2026-09-18T00:00:00Z',
    pii: false,
    dynamicText: false,
    source: 'crawl',
    pageUrl: START_URL,
  };
}

function storedRegistry(): SelectorRegistry {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-18T00:00:00Z', elements: [storedElement()] };
}

function storedApiSurface(): ApiSurface {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-09-18T00:00:00Z',
    endpoints: [{ method: 'GET', path: '/login', source: 'discovered', examples: ['/login'] }],
  };
}
