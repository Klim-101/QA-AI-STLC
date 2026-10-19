// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SafeModeRequestTally, playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crawl } from '../src/crawl.js';

// Fixed ports, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use. The application is
// served from PORT, its API from API_PORT, and a second API that no allowlist names from OTHER_PORT.
const PORT = 4705;
const API_PORT = 4706;
const OTHER_PORT = 4707;
const START_URL = `http://localhost:${String(PORT)}/spa-cross-origin.html?api=${String(API_PORT)}&other=${String(OTHER_PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;

const servers: ManagedServer[] = [];

beforeAll(
  async () => {
    servers.push(await startDemoApp(PORT), await startDemoApp(API_PORT), await startDemoApp(OTHER_PORT));
  },
  STARTUP_TIMEOUT_MS * 3 + 5_000,
);

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

async function readsOf(port: number): Promise<number> {
  const response = await fetch(`http://localhost:${String(port)}/api/cross/reads`);
  return ((await response.json()) as { reads: number }).reads;
}

// An application served from one port that reads from an API on another: exploring it saw pages
// without their data, because the allowlist could not name a second port (ADR-0019).
describe('exploring an application whose API is on another port (demo app)', () => {
  it('blocks both API ports, and reports them as ports, when the allowlist names only the host', async () => {
    const tally = new SafeModeRequestTally();

    const result = await crawl({
      startUrl: START_URL,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
      safeMode: { tally },
    });

    expect(result.routeMap.routes).toHaveLength(1);
    expect(tally.summary().blockedCounts).toEqual({ method: 0, host: 0, scheme: 0, port: 2 });
    expect(tally.summary().blocked).toEqual([
      { method: 'GET', path: '/api/cross/products', count: 2, reason: 'port' },
    ]);
    expect(await readsOf(API_PORT)).toBe(0);
    expect(await readsOf(OTHER_PORT)).toBe(0);
  }, 60_000);

  it('reads the API port the allowlist names, and still blocks the other one', async () => {
    const tally = new SafeModeRequestTally();
    const apiReadsBefore = await readsOf(API_PORT);
    const otherReadsBefore = await readsOf(OTHER_PORT);

    const result = await crawl({
      startUrl: START_URL,
      allowlist: ['localhost', `localhost:${String(API_PORT)}`],
      browserLauncher: playwrightBrowserLauncher,
      safeMode: { tally },
    });

    expect(result.routeMap.routes).toHaveLength(1);
    expect(tally.summary().blockedCounts).toEqual({ method: 0, host: 0, scheme: 0, port: 1 });
    expect(result.requestLogHar).toContain(
      `"url":"http://localhost:${String(OTHER_PORT)}/api/cross/products"`,
    );
    expect((await readsOf(API_PORT)) - apiReadsBefore).toBeGreaterThan(0);
    expect((await readsOf(OTHER_PORT)) - otherReadsBefore).toBe(0);
  }, 60_000);
});
