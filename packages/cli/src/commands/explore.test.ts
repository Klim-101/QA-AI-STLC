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
