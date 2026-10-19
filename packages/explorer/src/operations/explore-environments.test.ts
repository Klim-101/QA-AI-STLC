// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { ManifestStore, QaStore, type EngineContext } from '@qa-ai-stlc/core';
import {
  SCHEMA_VERSION,
  type ApiSurface,
  type SelectorElement,
  type SelectorRegistry,
} from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  createFakeExploreBrowserLauncher,
  type FakeExploreBrowserLauncherOptions,
} from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { buildRequestLogHar } from '../request-log.js';
import { persistExploreResult, runExplore } from './explore.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const REGISTRY_PATH = join(QA_DIR, 'selectors', 'registry.json');
const ENDPOINTS_PATH = join(QA_DIR, 'selectors', 'endpoints.json');
const STAGING_URL = 'https://staging.example.com/login';
const OTHER_URL = 'https://other.example.test/home';

const CONFIG_YAML = `${[
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  `  staging: { baseUrl: "${STAGING_URL}", allowlist: ["staging.example.com"] }`,
  `  other: { baseUrl: "${OTHER_URL}", allowlist: ["other.example.test"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
].join('\n')}\n`;

const BUTTON = {
  kind: 'button',
  accessibleName: 'Log in',
  testId: undefined,
  role: undefined,
  label: undefined,
  placeholder: undefined,
  htmlId: undefined,
  tagName: 'button',
  nthOfType: 1,
};
const ONE_BUTTON = { interactiveElements: [BUTTON], forms: [], tables: [], dialogs: [] };
const TWO_BUTTONS = {
  interactiveElements: [BUTTON, { ...BUTTON, accessibleName: 'Sign out', nthOfType: 2 }],
  forms: [],
  tables: [],
  dialogs: [],
};

function contextOf(
  browserOptions: FakeExploreBrowserLauncherOptions = {},
  extraFiles: Readonly<Record<string, string>> = {},
): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [join(QA_DIR, 'config.yaml')]: CONFIG_YAML, ...extraFiles }),
    clock: { now: () => new Date('2026-09-20T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeExploreBrowserLauncher({
      elementsByUrl: { [STAGING_URL]: ONE_BUTTON, [OTHER_URL]: ONE_BUTTON },
      locatorCount: 1,
      ...browserOptions,
    }),
    env: {},
  };
}

async function readRegistry(context: EngineContext): Promise<SelectorRegistry> {
  return JSON.parse(await context.fs.readFile(REGISTRY_PATH)) as SelectorRegistry;
}

function storedElement(overrides: Partial<SelectorElement> = {}): SelectorElement {
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
    pageUrl: STAGING_URL,
    ...overrides,
  };
}

function registryFile(elements: readonly SelectorElement[]): Record<string, string> {
  const registry: SelectorRegistry = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-09-18T00:00:00Z',
    elements: [...elements],
  };
  return { [REGISTRY_PATH]: JSON.stringify(registry) };
}

// A project with two environments on different origins shares one registry (ADR-0020): exploring or
// verifying one must not touch what the other found.
describe('runExplore with several environments (ADR-0020)', () => {
  it('leaves the elements of the first environment as they were when the second is explored', async () => {
    const context = contextOf();
    await runExplore(context, { environment: 'staging' });
    const before = (await readRegistry(context)).elements;

    const report = await runExplore(context, { environment: 'other' });

    const after = await readRegistry(context);
    expect(after.elements.filter((element) => element.environment === 'staging')).toEqual(before);
    expect(after.elements.filter((element) => element.environment === 'other')).toHaveLength(1);
    expect(after.elements.some((element) => element.deprecatedAt !== undefined)).toBe(false);
    expect(report).toEqual(
      expect.objectContaining({ elementCount: 1, added: 1, removed: 0, otherEnvironmentElementCount: 1 }),
    );
  });

  it('reports no removal for another environment on a repeated run', async () => {
    const context = contextOf();
    await runExplore(context, { environment: 'staging' });
    await runExplore(context, { environment: 'other' });

    const again = await runExplore(context, { environment: 'staging' });

    expect(again).toEqual(
      expect.objectContaining({ elementCount: 1, added: 0, removed: 0, otherEnvironmentElementCount: 1 }),
    );
    expect((await readRegistry(context)).elements).toHaveLength(2);
  });

  it('deprecates only an element of the explored environment that its crawl no longer finds', async () => {
    const first = contextOf({ elementsByUrl: { [STAGING_URL]: TWO_BUTTONS, [OTHER_URL]: TWO_BUTTONS } });
    await runExplore(first, { environment: 'staging' });
    await runExplore(first, { environment: 'other' });

    // The staging page lost a button; the other environment was not looked at.
    const second = contextOf(
      { elementsByUrl: { [STAGING_URL]: ONE_BUTTON, [OTHER_URL]: TWO_BUTTONS } },
      registryFile((await readRegistry(first)).elements),
    );
    const report = await runExplore(second, { environment: 'staging' });

    const registry = await readRegistry(second);
    const deprecated = registry.elements.filter((element) => element.deprecatedAt !== undefined);
    expect(report.removed).toBe(1);
    expect(deprecated).toHaveLength(1);
    expect(deprecated[0]?.environment).toBe('staging');
    expect(registry.elements.filter((element) => element.environment === 'other')).toHaveLength(2);
  });

  it('never gives two environments the same locator name', async () => {
    const context = contextOf();
    await runExplore(context, { environment: 'staging' });
    await runExplore(context, { environment: 'other' });

    const names = (await readRegistry(context)).elements.map((element) => element.name);

    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    // Two elements with one locator share a function, so the module may hold fewer functions than
    // elements; what it must never hold is two functions with one name.
    const locators = await context.fs.readFile(join(PROJECT_ROOT, 'tests', 'qa', 'locators.ts'));
    const exported = [...locators.matchAll(/export function (\w+)\(/gu)].map((match) => match[1]);
    expect(exported.length).toBeGreaterThan(0);
    expect(new Set(exported).size).toBe(exported.length);
  });

  it('keeps the name an element had when its environment is explored again', async () => {
    const context = contextOf();
    await runExplore(context, { environment: 'staging' });
    await runExplore(context, { environment: 'other' });
    const namesOf = async (): Promise<Map<string | undefined, string | undefined>> =>
      new Map((await readRegistry(context)).elements.map((element) => [element.environment, element.name]));
    const before = await namesOf();

    await runExplore(context, { environment: 'staging' });
    await runExplore(context, { environment: 'other' });

    expect(await namesOf()).toEqual(before);
  });

  it('claims an element written before the field existed only for the environment that admits its page', async () => {
    const context = contextOf(
      {},
      registryFile([
        storedElement({ elementId: 'old-staging', name: 'oldStaging' }),
        storedElement({ elementId: 'old-other', name: 'oldOther', pageUrl: OTHER_URL }),
      ]),
    );

    await runExplore(context, { environment: 'other' });

    const byId = new Map(
      (await readRegistry(context)).elements.map((element) => [element.elementId, element]),
    );
    expect(byId.get('old-other')?.environment).toBe('other');
    expect(byId.get('old-staging')?.environment).toBeUndefined();
    expect(byId.get('old-staging')?.deprecatedAt).toBeUndefined();
  });

  it('keeps an element that belongs to no page, and counts it for every environment', async () => {
    const fromSource: SelectorElement = {
      elementId: 'from-source',
      name: 'fromSource',
      kind: 'button',
      locatorCandidates: [{ strategy: 'testId', value: 'from-source', fragile: false }],
      stabilityScore: 1,
      lastVerifiedAt: '2026-09-18T00:00:00Z',
      source: 'static',
    };
    const context = contextOf({}, registryFile([fromSource]));

    const report = await runExplore(context, { environment: 'other' });

    expect(report.otherEnvironmentElementCount).toBe(0);
    expect((await readRegistry(context)).elements.map((element) => element.elementId)).toContain(
      'from-source',
    );
  });

  it('records the environment on the endpoints a crawl found, and counts only its own', async () => {
    const context = contextOf();
    await runExplore(context, { environment: 'staging' });

    const report = await runExplore(context, { environment: 'other' });

    const endpoints = JSON.parse(await context.fs.readFile(ENDPOINTS_PATH)) as ApiSurface;
    expect(endpoints.endpoints.map((endpoint) => endpoint.environment).sort()).toEqual(['other', 'staging']);
    expect(report.endpointCount).toBe(1);
  });

  describe('--verify', () => {
    const stored = (): SelectorElement[] => [
      storedElement({ elementId: 'staging-el', name: 'stagingEl', environment: 'staging' }),
      storedElement({ elementId: 'other-el', name: 'otherEl', pageUrl: OTHER_URL, environment: 'other' }),
    ];

    it('checks only the elements of the environment it was given', async () => {
      const context = contextOf(
        {
          subRequestsByUrl: {
            [STAGING_URL]: [{ method: 'POST', url: 'https://staging.example.com/staging-page' }],
            [OTHER_URL]: [{ method: 'POST', url: 'https://other.example.test/other-page' }],
          },
        },
        registryFile(stored()),
      );

      const report = await runExplore(context, { verify: true, environment: 'other' });

      // A page is only opened for an element that is checked: the staging page was never visited.
      expect(report.blockedRequests.map((request) => request.path)).toEqual(['/other-page']);
      expect(report).toEqual(
        expect.objectContaining({ mode: 'verify', elementCount: 1, otherEnvironmentElementCount: 1 }),
      );
    });

    it('does not report the locators of another environment as missing', async () => {
      const elements = stored().map((element) =>
        element.environment === 'staging' ? { ...element, locatorCandidates: [] } : element,
      );
      const context = contextOf({}, registryFile(elements));

      const report = await runExplore(context, { verify: true, environment: 'other' });

      expect(report.missingLocatorCount).toBe(0);
    });

    it('counts only the endpoints of its own environment', async () => {
      const surface: ApiSurface = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: '2026-09-18T00:00:00Z',
        endpoints: [
          { method: 'GET', path: '/a', source: 'discovered', environment: 'staging' },
          { method: 'GET', path: '/b', source: 'discovered', environment: 'other' },
          { method: 'GET', path: '/c', source: 'discovered' },
        ],
      };
      const context = contextOf({}, { ...registryFile(stored()), [ENDPOINTS_PATH]: JSON.stringify(surface) });

      const report = await runExplore(context, { verify: true, environment: 'other' });

      expect(report.endpointCount).toBe(2);
    });
  });
});

describe('persistExploreResult without an environment (ADR-0020)', () => {
  async function persist(context: EngineContext, elements: readonly SelectorElement[]) {
    const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
    const manifest = new ManifestStore({ store, clock: context.clock });
    return persistExploreResult(
      context,
      store,
      manifest,
      undefined,
      elements,
      0,
      buildRequestLogHar([], '2026-09-20T12:00:00.000Z'),
    );
  }

  it('stores what a pick-mode session found as it is, on a first run and on a later one', async () => {
    const context = contextOf();
    const picked = storedElement({ elementId: 'picked', name: 'picked', source: 'manual' });

    const first = await persist(context, [picked]);
    const second = await persist(context, [picked]);

    expect((await readRegistry(context)).elements).toEqual([picked]);
    expect(first).toEqual(expect.objectContaining({ elementCount: 1, otherEnvironmentElementCount: 0 }));
    expect(second).toEqual(
      expect.objectContaining({ elementCount: 1, added: 0, removed: 0, otherEnvironmentElementCount: 0 }),
    );
  });
});

describe('runExplore beside an element of another environment that has no name', () => {
  it('leaves it alone and still names its own elements', async () => {
    const nameless: SelectorElement = {
      elementId: 'nameless',
      kind: 'button',
      locatorCandidates: [{ strategy: 'testId', value: 'nameless', fragile: false }],
      stabilityScore: 1,
      lastVerifiedAt: '2026-09-18T00:00:00Z',
      source: 'crawl',
      pageUrl: OTHER_URL,
      environment: 'other',
    };
    const context = contextOf({}, registryFile([nameless]));

    const report = await runExplore(context, { environment: 'staging' });

    const registry = await readRegistry(context);
    expect(registry.elements.find((element) => element.elementId === 'nameless')).toEqual(nameless);
    expect(registry.elements.filter((element) => element.environment === 'staging')).toHaveLength(1);
    expect(report.otherEnvironmentElementCount).toBe(1);
  });
});
