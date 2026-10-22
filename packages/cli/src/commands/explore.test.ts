// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import {
  createFakeExploreBrowserLauncher,
  type FakeExploreBrowserLauncherOptions,
} from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { runInit } from './init.js';
import { runExplore } from './explore.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };
const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const START_URL = 'https://staging.example.com/login';

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
].join('\n');

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
  configYaml: string = CONFIG_YAML,
  env: Readonly<Record<string, string | undefined>> = {},
): Promise<CommandContext> {
  const fs = createFakeFileSystem();
  const context = createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: noopIo,
    fs,
    env,
    browserLauncher: createFakeExploreBrowserLauncher(browserOptions),
  });
  await runInit(context, { deferScope: true });
  await fs.writeFile(join(QA_DIR, 'config.yaml'), `${configYaml}\n`);
  return context;
}

describe('runExplore', () => {
  it('delegates to the shared explore operation when --pick is not given', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });

    const report = await runExplore(context);

    expect(report).toEqual(
      expect.objectContaining({ mode: 'explore', elementCount: 1, added: 1, removed: 0, degraded: [] }),
    );
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

  it('records the environment on a picked element, and counts the elements of others apart (ADR-0020)', async () => {
    const context = await fakeContext({
      pickModeState: {
        done: true,
        captures: [{ pickId: 'pick-1', kind: 'button', tagName: 'button', nthOfType: 1 }],
      },
      locatorCount: 1,
    });
    const otherHost: SelectorRegistry = {
      schemaVersion: 1,
      generatedAt: '2026-09-18T00:00:00Z',
      elements: [
        {
          elementId: 'elsewhere',
          name: 'elsewhere',
          kind: 'button',
          locatorCandidates: [{ strategy: 'testId', value: 'x', fragile: false }],
          stabilityScore: 1,
          lastVerifiedAt: '2026-09-18T00:00:00Z',
          source: 'crawl',
          pageUrl: 'https://other.example.test/home',
        },
      ],
    };
    await context.fs.mkdir(join(QA_DIR, 'selectors'));
    await context.fs.writeFile(join(QA_DIR, 'selectors', 'registry.json'), JSON.stringify(otherHost));

    const report = await runExplore(context, { pick: START_URL, environment: 'staging' });

    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements.find((element) => element.source === 'manual')?.environment).toBe('staging');
    expect(report.otherEnvironmentElementCount).toBe(1);
  });

  it('leaves a picked element unscoped when the page belongs to no configured environment', async () => {
    const configYaml = CONFIG_YAML.replace(/environments:\n.*\n/u, 'environments: {}\n');
    const context = await fakeContext(
      {
        pickModeState: {
          done: true,
          captures: [{ pickId: 'pick-1', kind: 'button', tagName: 'button', nthOfType: 1 }],
        },
        locatorCount: 1,
      },
      configYaml,
    );

    const report = await runExplore(context, { pick: START_URL });

    const registry = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'selectors', 'registry.json')),
    ) as SelectorRegistry;
    expect(registry.elements[0]?.environment).toBeUndefined();
    expect(report.otherEnvironmentElementCount).toBe(0);
  });

  it('launches pick mode headed, so a human can actually see the window to click in', async () => {
    const context = await fakeContext({
      pickModeState: { done: true, captures: [] },
    });
    const launcher = context.browserLauncher as ReturnType<typeof createFakeExploreBrowserLauncher>;

    await runExplore(context, { pick: 'https://staging.example.com/login' });

    expect(launcher.launchCalls).toContainEqual({ headless: false });
  });

  it('signs in with a configured storage-state identity before pick mode', async () => {
    const configYaml = [
      'schemaVersion: 1',
      'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
      `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"] }`,
      'identities:\n  admin: { auth: storage-state, secret: QA_ADMIN_PASSWORD, loginUrl: "https://staging.example.com/login", username: "admin@example.com" }',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    ].join('\n');
    const context = await fakeContext({ pickModeState: { done: true, captures: [] } }, configYaml, {
      QA_ADMIN_PASSWORD: 'secret',
    });

    const report = await runExplore(context, {
      pick: 'https://staging.example.com/login',
      identity: 'admin',
    });

    expect(report.elementCount).toBe(0);
  });

  it('bypasses TLS validation in pick mode when the named environment opts out (P2-18)', async () => {
    const configYaml = [
      'schemaVersion: 1',
      'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
      `environments:\n  staging: { baseUrl: "${START_URL}", allowlist: ["staging.example.com"], tlsInsecure: true }`,
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    ].join('\n');
    const context = await fakeContext({ pickModeState: { done: true, captures: [] } }, configYaml);

    const report = await runExplore(context, {
      pick: 'https://staging.example.com/login',
      environment: 'staging',
    });

    expect(report.elementCount).toBe(0);
  });

  it('opens the pick-mode context in the named environment locale (P6-114)', async () => {
    const context = await fakeContext(
      { pickModeState: { done: true, captures: [] } },
      CONFIG_YAML.replace(
        'allowlist: ["staging.example.com"] }',
        'allowlist: ["staging.example.com"], locale: es-ES }',
      ),
    );

    await runExplore(context, { pick: 'https://staging.example.com/login', environment: 'staging' });

    const { newContextCalls } = context.browserLauncher as ReturnType<
      typeof createFakeExploreBrowserLauncher
    >;
    expect(newContextCalls).toEqual([{ locale: 'es-ES' }]);
  });

  it('leaves the pick-mode locale to the host when the environment sets none (P6-114)', async () => {
    const context = await fakeContext({ pickModeState: { done: true, captures: [] } });

    await runExplore(context, { pick: 'https://staging.example.com/login', environment: 'staging' });

    const { newContextCalls } = context.browserLauncher as ReturnType<
      typeof createFakeExploreBrowserLauncher
    >;
    expect(newContextCalls).toEqual([{}]);
  });

  it('runs pick mode without TLS bypass when no environment can be resolved (P2-18)', async () => {
    const configYaml = [
      'schemaVersion: 1',
      'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
      'environments: {}',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    ].join('\n');
    const context = await fakeContext({ pickModeState: { done: true, captures: [] } }, configYaml);

    const report = await runExplore(context, { pick: 'https://staging.example.com/login' });

    expect(report.elementCount).toBe(0);
  });

  describe('safe-mode guard (P6-95)', () => {
    const subRequests = (url: string): FakeExploreBrowserLauncherOptions => ({
      pickModeState: { done: true, captures: [] },
      subRequestsByUrl: {
        [url]: [
          { method: 'POST', url: 'https://staging.example.com/orders' },
          { method: 'GET', url: 'https://other.example.com/script.js' },
        ],
      },
    });

    it('blocks writes and off-allowlist requests while the operator browses, and reports them', async () => {
      const context = await fakeContext(subRequests(START_URL));

      const report = await runExplore(context, { pick: START_URL, environment: 'staging' });

      expect(report.blockedRequestCount).toBe(2);
      expect(report.blockedRequests).toEqual([
        { method: 'GET', path: '/script.js', count: 1, reason: 'host' },
        { method: 'POST', path: '/orders', count: 1, reason: 'method' },
      ]);
      expect(report.blockedRequestCounts).toEqual({ method: 1, host: 1, scheme: 0, port: 0 });
    });

    it('allows only the picked page host when no environment can be resolved', async () => {
      const configYaml = CONFIG_YAML.replace(/environments:\n.*\n/u, 'environments: {}\n');
      const context = await fakeContext(subRequests(START_URL), configYaml);

      const report = await runExplore(context, { pick: START_URL });

      expect(report.blockedRequestCount).toBe(2);
    });

    it('lets through a POST the environment names exactly (ADR-0014)', async () => {
      const configYaml = CONFIG_YAML.replace(
        'allowlist: ["staging.example.com"] }',
        'allowlist: ["staging.example.com"], safeNonGetRequests: [{ method: POST, path: /orders, reason: opens the session }] }',
      );
      const context = await fakeContext(subRequests(START_URL), configYaml);

      const report = await runExplore(context, { pick: START_URL, environment: 'staging' });

      expect(report.blockedRequestCount).toBe(1);
      expect(report.allowedRequests).toEqual([{ method: 'POST', path: '/orders', count: 1 }]);
    });

    it('refuses a page that is not on the environment allowlist before opening a browser', async () => {
      const context = await fakeContext({ pickModeState: { done: true, captures: [] } });

      await expect(
        runExplore(context, { pick: 'https://other.example.com/', environment: 'staging' }),
      ).rejects.toMatchObject({ code: 'explorer.pick_mode.url_not_allowed' });
    });
  });

  it('merges pick mode onto a registry already built by a crawl', async () => {
    const context = await fakeContext({ elementsByUrl: { [START_URL]: ONE_ELEMENT }, locatorCount: 1 });
    await runExplore(context);

    const pickContext = createCommandContext({
      projectRoot: context.projectRoot,
      io: noopIo,
      fs: context.fs,
      env: {},
      browserLauncher: createFakeExploreBrowserLauncher({
        pickModeState: {
          done: true,
          captures: [{ pickId: 'pick-1', kind: 'button', tagName: 'button', nthOfType: 1 }],
        },
        locatorCount: 1,
      }),
    });

    const report = await runExplore(pickContext, { pick: 'https://staging.example.com/other' });

    expect(report.elementCount).toBe(2);
  });
});
