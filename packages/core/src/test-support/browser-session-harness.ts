// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { BrowserSessionStore } from '../browser-session-store.js';
import type { BrowserOperationContext } from '../operations/browser-context.js';
import {
  createFakeBrowserLauncher,
  type FakeBrowserLauncher,
  type FakeBrowserLauncherOptions,
} from './fake-browser-launcher.js';
import { createFakeEngineContext } from './fake-engine-context.js';
import { createFakeFileSystem, type FakeFileSystem } from './fake-file-system.js';
import { createSequentialIdGenerator } from './fake-id-generator.js';

export const BROWSER_TEST_PROJECT_ROOT = 'project';

/** A one-environment project the `browser.*` operations can be driven against. */
export const BROWSER_TEST_CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities:',
  '  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

export interface BrowserTestHarnessOptions {
  readonly launcherOptions?: FakeBrowserLauncherOptions;
  /** Omit to write the default single-environment config; pass `null` for a project with none. */
  readonly configYaml?: string | null;
  readonly now?: string;
}

export interface BrowserTestHarness {
  readonly context: BrowserOperationContext;
  readonly sessions: BrowserSessionStore;
  readonly launcher: FakeBrowserLauncher;
  readonly fs: FakeFileSystem;
}

/** Wires a `BrowserOperationContext` to fakes with deterministic ids and a fixed clock. */
export function createBrowserTestHarness(options: BrowserTestHarnessOptions = {}): BrowserTestHarness {
  const configYaml = options.configYaml === undefined ? BROWSER_TEST_CONFIG_YAML : options.configYaml;
  const configPath = join(BROWSER_TEST_PROJECT_ROOT, '.qa', 'config.yaml');
  const fs = createFakeFileSystem(configYaml === null ? {} : { [configPath]: configYaml });
  const launcher = createFakeBrowserLauncher(options.launcherOptions ?? {});
  const now = new Date(options.now ?? '2026-09-21T10:00:00.000Z');
  const sessions = new BrowserSessionStore({
    clock: { now: () => now },
    idGenerator: createSequentialIdGenerator('1'),
  });

  return {
    context: {
      engine: createFakeEngineContext({
        projectRoot: BROWSER_TEST_PROJECT_ROOT,
        fs,
        browserLauncher: launcher,
        clock: { now: () => now },
      }),
      sessions,
    },
    sessions,
    launcher,
    fs,
  };
}
