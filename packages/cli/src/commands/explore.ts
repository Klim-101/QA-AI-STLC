// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ManifestStore, QaStore, loadConfig } from '@qa-ai-stlc/core';
import {
  capturePickModeElements,
  finalizeManualSelectorEntries,
  injectPickModeOverlay,
  persistExploreResult,
  resolveIdentity,
  resolvePolicy,
  resolveStorageState,
  runExplore as runExploreOperation,
  waitForPickModeCompletion,
  type ExploreOptions as ExploreOperationOptions,
  type ExploreReport,
} from '@qa-ai-stlc/explorer';
import { SelectorRegistrySchema, type SelectorElement } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

const REGISTRY_PATH = 'selectors/registry.json';

export type { ExploreReport } from '@qa-ai-stlc/explorer';

export interface ExploreOptions extends ExploreOperationOptions {
  /** A single URL to run pick mode against instead of crawling. Not exposed over MCP. */
  readonly pick?: string;
}

async function runPickModeSession(
  context: CommandContext,
  options: ExploreOptions & { readonly pick: string },
): Promise<{ elements: SelectorElement[]; blockedRequestCount: number }> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(store);
  const identity = resolveIdentity(context, config, options);
  const policy = resolvePolicy(config, options.policy);
  const storageState = await resolveStorageState(context.browserLauncher, identity);

  // Headed: a human clicks the elements in this window, unlike every other launch() call here.
  const browser = await context.browserLauncher.launch({ headless: false });
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
  const previous = (await store.pathExists(REGISTRY_PATH))
    ? await store.readJson(REGISTRY_PATH, SelectorRegistrySchema)
    : undefined;

  const { elements, blockedRequestCount } = await runPickModeSession(context, {
    ...options,
    pick: options.pick,
  });

  return persistExploreResult(context, store, manifest, previous, elements, blockedRequestCount);
}
