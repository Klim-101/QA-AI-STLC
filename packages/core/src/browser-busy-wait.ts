// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from './errors.js';
import type { BrowserSession } from './browser-session-store.js';

const POLL_INTERVAL_MS = 50;

interface BusyWaitArgs {
  readonly busySelectors: readonly string[];
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

/**
 * Waits until none of the session's busy indicators is on the page, so an action is issued against
 * (and read back from) a settled UI. Bounded by the session's action timeout; a loading mask that
 * never leaves fails with `BROWSER_BUSY_TIMEOUT` instead of an obscure click timeout.
 */
export async function waitForBusyToClear(session: BrowserSession): Promise<void> {
  if (session.busySelectors.length === 0) {
    return;
  }
  /* v8 ignore start -- runs in the browser's own V8 instance, invisible to Node coverage */
  const stillBusy = await session.page.evaluate(
    async ({ busySelectors, timeoutMs, pollIntervalMs }: BusyWaitArgs) => {
      // This package compiles without DOM types, so the page's own `document` is typed locally.
      const { document } = globalThis as unknown as {
        document: { querySelector(selector: string): unknown };
      };
      const deadline = Date.now() + timeoutMs;
      const findBusy = (): string | null =>
        busySelectors.find((selector) => document.querySelector(selector) !== null) ?? null;
      let busy = findBusy();
      while (busy !== null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        busy = findBusy();
      }
      return busy;
    },
    {
      busySelectors: session.busySelectors,
      timeoutMs: session.actionTimeoutMs,
      pollIntervalMs: POLL_INTERVAL_MS,
    },
  );
  /* v8 ignore stop */
  // Only an explicit `null` means clear: any other result (a selector still present, or a page
  // that answered with something unexpected) must not be read as a settled page.
  if (stillBusy === null) {
    return;
  }
  const indicator = typeof stillBusy === 'string' ? stillBusy : session.busySelectors.join(', ');
  throw new QaError(
    'BROWSER_BUSY_TIMEOUT',
    `"${indicator}" was still on the page after ${String(session.actionTimeoutMs)} ms`,
    {
      remediation:
        'Raise the environment actionTimeoutMs, or remove the selector from ui.busySelectors if it is not a busy indicator.',
    },
  );
}
