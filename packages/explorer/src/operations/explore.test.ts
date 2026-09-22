// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError, type EngineContext } from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  createFakeExploreBrowserLauncher,
  type FakeExploreBrowserLauncherOptions,
} from '../test-support/fake-explore-browser-launcher.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '../test-support/fake-http-client.js';
import { createFakeProcessRunner } from '../test-support/fake-process-runner.js';
import { runExplore } from './explore.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const START_URL = 'https://staging.example.com/login';

interface ConfigOptions {
  readonly environments?: string;
  readonly identities?: string;
  readonly source?: string;
  readonly policy?: string;
}

function configYaml(options: ConfigOptions = {}): string {
  return `${[
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    options.source ?? '',
    options.environments ??
      `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"] }`,
    options.identities ?? 'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    `selectors: { policy: ${options.policy ?? 'playwright-default'}, testIdAttribute: data-testid }`,
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
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
      expect.objectContaining({ mode: 'explore', elementCount: 1, added: 1, removed: 0, degraded: [] }),
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
    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(Object.keys(manifest.artifacts)).toEqual(
      expect.arrayContaining([
        'selectors/registry.json',
        'tests/qa/locators.ts',
        'selectors/missing-test-ids.json',
      ]),
    );
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
