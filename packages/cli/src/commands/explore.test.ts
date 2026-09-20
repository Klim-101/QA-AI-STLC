// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import {
  createFakeExploreBrowserLauncher,
  type FakeExploreBrowserLauncherOptions,
} from '../test-support/fake-browser-launcher.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { runInit } from './init.js';
import { runExplore } from './explore.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };
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

async function fakeContext(
  browserOptions: FakeExploreBrowserLauncherOptions = {},
  configOptions?: ConfigOptions,
): Promise<CommandContext> {
  const fs = createFakeFileSystem();
  const context = createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: noopIo,
    fs,
    env: {},
    browserLauncher: createFakeExploreBrowserLauncher(browserOptions),
  });
  await runInit(context, { deferScope: true });
  await fs.writeFile(join(QA_DIR, 'config.yaml'), configYaml(configOptions));
  return context;
}

describe('runExplore', () => {
  it('crawls the single configured environment, builds a registry and writes every artifact', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

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
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });
    const first = await runExplore(context);
    expect(first.added).toBe(1);

    const secondContext = createCommandContext({
      projectRoot: context.projectRoot,
      io: noopIo,
      fs: context.fs,
      env: {},
      browserLauncher: createFakeExploreBrowserLauncher({
        elementsByUrl: { [START_URL]: { interactiveElements: [], forms: [], tables: [], dialogs: [] } },
        locatorCount: 1,
      }),
    });

    const second = await runExplore(secondContext);

    expect(second.added).toBe(0);
    expect(second.removed).toBe(1);
    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements.some((element) => element.deprecatedAt !== undefined)).toBe(true);
  });

  it('throws EXPLORE_ENVIRONMENT_UNKNOWN for an --environment not in config.yaml', async () => {
    const context = await fakeContext();

    await expect(runExplore(context, { environment: 'nope' })).rejects.toThrow(QaError);
  });

  it('throws EXPLORE_ENVIRONMENT_AMBIGUOUS when no --environment is given and config.yaml has none', async () => {
    const context = await fakeContext({}, { environments: 'environments: {}' });

    await expect(runExplore(context)).rejects.toThrow('config.yaml defines no environments');
  });

  it('throws EXPLORE_ENVIRONMENT_AMBIGUOUS when no --environment is given and config.yaml has several', async () => {
    const context = await fakeContext(
      {},
      {
        environments:
          'environments:\n  staging: { baseUrl: "https://a.example.com", allowlist: ["a.example.com"] }\n  prod: { baseUrl: "https://b.example.com", allowlist: ["b.example.com"] }',
      },
    );

    await expect(runExplore(context)).rejects.toThrow('more than one');
  });

  it('throws EXPLORE_IDENTITY_UNKNOWN for an --identity not in config.yaml', async () => {
    const context = await fakeContext();

    await expect(runExplore(context, { identity: 'nope' })).rejects.toThrow(QaError);
  });

  it('signs in with a configured storage-state identity before crawling', async () => {
    const context = await fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      {
        identities:
          'identities:\n  admin: { auth: storage-state, secret: QA_ADMIN_PASSWORD, loginUrl: "https://staging.example.com/login", username: "admin@example.com" }',
      },
    );
    const contextWithSecret = createCommandContext({
      projectRoot: context.projectRoot,
      io: noopIo,
      fs: context.fs,
      env: { QA_ADMIN_PASSWORD: 'secret' },
      browserLauncher: context.browserLauncher,
    });

    const report = await runExplore(contextWithSecret, { identity: 'admin' });

    expect(report.elementCount).toBe(1);
  });

  it('signs in over CDP when a configured identity uses cdp-attach', async () => {
    const context = await fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { identities: 'identities:\n  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }' },
    );

    const report = await runExplore(context, { identity: 'admin', cdpEndpointUrl: 'ws://localhost:9222' });

    expect(report.elementCount).toBe(1);
  });

  it('rejects an unknown --policy value', async () => {
    const context = await fakeContext();

    await expect(runExplore(context, { policy: 'not-a-policy' })).rejects.toThrow(QaError);
  });

  it('uses config.yaml selectors.policy when no --policy override is given', async () => {
    const context = await fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { policy: 'testid-first' },
    );

    const report = await runExplore(context);

    expect(report.elementCount).toBe(1);
  });

  it('uses a --policy override instead of config.yaml selectors.policy', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    const report = await runExplore(context, { policy: 'testid-first' });

    expect(report.elementCount).toBe(1);
  });

  it('crawls the environment named by an explicit --environment', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    const report = await runExplore(context, { environment: 'staging' });

    expect(report.elementCount).toBe(1);
  });

  it('caps the crawl at --max-pages', async () => {
    const context = await fakeContext({
      elementsByUrl: { [START_URL]: ONE_ELEMENT },
      linksByUrl: { [START_URL]: ['https://staging.example.com/other'] },
      locatorCount: 1,
    });

    const report = await runExplore(context, { maxPages: 1 });

    expect(report.elementCount).toBe(1);
  });

  it('throws EXPLORE_STATIC_SOURCE_MISSING when --static is given but config.yaml has no source.path', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    await expect(runExplore(context, { static: true })).rejects.toThrow(QaError);
  });

  it('merges static source analysis findings when --static is given', async () => {
    const context = await fakeContext(
      { elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 },
      { source: 'source: { path: app-src }' },
    );
    await context.fs.writeFile(
      join(PROJECT_ROOT, 'app-src', 'Login.tsx'),
      '<button data-testid="submit">Submit</button>',
    );
    await context.fs.writeFile(join(PROJECT_ROOT, 'app-src', 'README.md'), 'not scanned: wrong extension');

    const report = await runExplore(context, { static: true });

    expect(report.elementCount).toBe(2);
    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements.some((element) => element.source === 'static')).toBe(true);
  });

  it('runs pick mode against a single URL and merges the manually-confirmed elements', async () => {
    const context = await fakeContext({
      pickModeState: {
        done: true,
        captures: [{ pickId: 'pick-1', kind: 'button', tagName: 'button', nthOfType: 1 }],
      },
      locatorCount: 1,
    });

    const report = await runExplore(context, { pick: 'https://staging.example.com/login' });

    expect(report.elementCount).toBe(1);
    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements[0]?.source).toBe('manual');
    expect(registry.elements[0]?.pageUrl).toBe('https://staging.example.com/login');
  });

  it('launches pick mode headed, so a human can actually see the window to click in', async () => {
    const context = await fakeContext({
      pickModeState: { done: true, captures: [] },
    });
    const launcher = context.browserLauncher as ReturnType<typeof createFakeExploreBrowserLauncher>;

    await runExplore(context, { pick: 'https://staging.example.com/login' });

    expect(launcher.launchCalls).toContainEqual({ headless: false });
  });

  it('launches a crawl headless, unlike pick mode', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });
    const launcher = context.browserLauncher as ReturnType<typeof createFakeExploreBrowserLauncher>;

    await runExplore(context);

    expect(launcher.launchCalls).not.toContainEqual({ headless: false });
  });

  it('throws EXPLORE_NO_REGISTRY when --verify is given but no registry has been built yet', async () => {
    const context = await fakeContext();

    await expect(runExplore(context, { verify: true })).rejects.toThrow(QaError);
  });

  it('reports no degraded selectors when every stored candidate still resolves as well as before', async () => {
    const context = await fakeContext({ locatorCount: 1 });
    await context.fs.writeFile(join(QA_DIR, 'selectors', 'registry.json'), JSON.stringify(storedRegistry()));

    const report = await runExplore(context, { verify: true });

    expect(report).toEqual(expect.objectContaining({ mode: 'verify', elementCount: 1, degraded: [] }));
  });

  it('reports a degraded selector when a stored candidate no longer resolves (a renamed test ID)', async () => {
    const context = await fakeContext({ locatorCount: 0 });
    await context.fs.writeFile(join(QA_DIR, 'selectors', 'registry.json'), JSON.stringify(storedRegistry()));

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
    const context = await fakeContext({ locatorCount: 0 });
    await context.fs.writeFile(join(QA_DIR, 'selectors', 'registry.json'), JSON.stringify(registry));

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
    const context = await fakeContext({ locatorCount: 0 });
    await context.fs.writeFile(join(QA_DIR, 'selectors', 'registry.json'), JSON.stringify(registry));

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
