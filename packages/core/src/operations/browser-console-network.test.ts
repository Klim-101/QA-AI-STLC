// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserConsole } from './browser-console.js';
import { DEFAULT_LOG_READ_LIMIT, MAX_LOG_READ_LIMIT } from './browser-log-read.js';
import { runBrowserNetwork } from './browser-network.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserTabs } from './browser-tabs.js';

async function openHarness() {
  const harness = createBrowserTestHarness();
  const { sessionId } = await runBrowserOpen(harness.context);
  return { harness, sessionId };
}

function evidenceJson(harness: ReturnType<typeof createBrowserTestHarness>, path: string): unknown {
  return JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', path))));
}

describe('runBrowserConsole (P6-61)', () => {
  it('returns the messages and uncaught exceptions of the session, redacted and with a cursor', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseConsole('log', 'hello');
    harness.launcher.raiseConsole('error', 'login failed for Bearer abcdefghijklmnopqrstuvwxyz0123');
    harness.launcher.raisePageError('TypeError: x is undefined');

    const result = await runBrowserConsole(harness.context, { sessionId });

    expect(result.entries).toEqual([
      { seq: 1, tabId: 'tab-1', level: 'log', text: 'hello' },
      { seq: 2, tabId: 'tab-1', level: 'error', text: 'login failed for [REDACTED]' },
      { seq: 3, tabId: 'tab-1', level: 'pageerror', text: 'TypeError: x is undefined' },
    ]);
    expect(result).toMatchObject({ omittedCount: 0, missedCount: 0, cursor: 3 });
  });

  it('registers the full redacted log as console-log evidence, with the step', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseConsole('warning', 'careful');

    const result = await runBrowserConsole(harness.context, { sessionId, stepId: 'step-3' });

    expect(result.evidence).toMatchObject({ kind: 'console-log', stepId: 'step-3' });
    expect(evidenceJson(harness, result.evidence.path)).toEqual({
      sessionId,
      log: 'console',
      capturedAt: '2026-09-21T10:00:00.000Z',
      since: 0,
      missedCount: 0,
      entries: [{ seq: 1, tabId: 'tab-1', level: 'warning', text: 'careful' }],
    });
  });

  it('reads only what came after a cursor and carries on from where it left off', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseConsole('log', 'one');
    const first = await runBrowserConsole(harness.context, { sessionId });
    harness.launcher.raiseConsole('log', 'two');

    const second = await runBrowserConsole(harness.context, { sessionId, since: first.cursor });

    expect(second.entries.map((entry) => entry.text)).toEqual(['two']);
    expect(second.cursor).toBe(2);
  });

  it('returns only errors and warnings with errorsOnly, but keeps everything in the evidence', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseConsole('log', 'noise');
    harness.launcher.raiseConsole('warning', 'warned');
    harness.launcher.raiseConsole('error', 'broke');
    harness.launcher.raisePageError('thrown');

    const result = await runBrowserConsole(harness.context, { sessionId, errorsOnly: true });

    expect(result.entries.map((entry) => entry.text)).toEqual(['warned', 'broke', 'thrown']);
    expect((evidenceJson(harness, result.evidence.path) as { entries: unknown[] }).entries).toHaveLength(4);
    expect(result.cursor).toBe(4);
  });

  it('caps what it returns, says how many were left, and continues exactly where it stopped', async () => {
    const { harness, sessionId } = await openHarness();
    for (let index = 1; index <= 5; index += 1) {
      harness.launcher.raiseConsole('log', `message ${String(index)}`);
    }

    const first = await runBrowserConsole(harness.context, { sessionId, limit: 2 });
    const rest = await runBrowserConsole(harness.context, { sessionId, since: first.cursor });

    expect(first.entries.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(first).toMatchObject({ omittedCount: 3, cursor: 2 });
    expect(rest.entries.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(rest.omittedCount).toBe(0);
  });

  it('defaults to a page of entries and never returns more than the maximum', async () => {
    const { harness, sessionId } = await openHarness();
    for (let index = 0; index < MAX_LOG_READ_LIMIT + 20; index += 1) {
      harness.launcher.raiseConsole('log', 'x');
    }

    const byDefault = await runBrowserConsole(harness.context, { sessionId });
    const greedy = await runBrowserConsole(harness.context, { sessionId, limit: 10_000 });
    const none = await runBrowserConsole(harness.context, { sessionId, limit: 0 });

    expect(byDefault.entries).toHaveLength(DEFAULT_LOG_READ_LIMIT);
    expect(greedy.entries).toHaveLength(MAX_LOG_READ_LIMIT);
    expect(none.entries).toHaveLength(1);
  });

  it('caps the text of each returned entry shorter than the evidence keeps it', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseConsole('log', 'y'.repeat(400));

    const result = await runBrowserConsole(harness.context, { sessionId });

    expect(result.entries[0]?.text).toBe(`${'y'.repeat(200)}…`);
    expect(JSON.stringify(evidenceJson(harness, result.evidence.path))).toContain('y'.repeat(400));
  });

  it('is empty, with a cursor of 0, before anything was logged', async () => {
    const { harness, sessionId } = await openHarness();

    expect(await runBrowserConsole(harness.context, { sessionId })).toMatchObject({
      entries: [],
      cursor: 0,
      omittedCount: 0,
    });
  });

  it('also logs the messages of a page the application opened, under its own tab', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.openPopup('https://staging.example.test/popup');
    await runBrowserTabs(harness.context, { sessionId, settleMs: 0 });
    harness.launcher.raiseConsole('error', 'from the popup', 1);

    const result = await runBrowserConsole(harness.context, { sessionId });

    expect(result.entries).toMatchObject([{ tabId: 'tab-2', text: 'from the popup' }]);
  });

  it('rejects an unknown session', async () => {
    const { harness } = await openHarness();

    await expect(runBrowserConsole(harness.context, { sessionId: 'session-gone' })).rejects.toMatchObject({
      code: 'BROWSER_SESSION_NOT_FOUND',
    });
  });
});

describe('runBrowserNetwork (P6-61)', () => {
  it('returns method, status or failure and a templated URL, and nothing else about the request', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseResponse({
      method: 'GET',
      url: 'https://staging.example.test/api/orders/42?token=secret-value&page=2',
      status: 200,
    });
    harness.launcher.raiseResponse({
      method: 'POST',
      url: 'https://staging.example.test/api/orders',
      status: 500,
    });
    harness.launcher.raiseRequestFailed({
      method: 'POST',
      url: 'https://staging.example.test/api/save',
      errorText: 'net::ERR_FAILED',
    });
    harness.launcher.raiseRequestFailed({ method: 'GET', url: 'https://staging.example.test/x' });

    const result = await runBrowserNetwork(harness.context, { sessionId });

    expect(result.entries).toEqual([
      {
        seq: 1,
        tabId: 'tab-1',
        method: 'GET',
        status: 200,
        url: 'https://staging.example.test/api/orders/:id?page&token',
      },
      { seq: 2, tabId: 'tab-1', method: 'POST', status: 500, url: 'https://staging.example.test/api/orders' },
      {
        seq: 3,
        tabId: 'tab-1',
        method: 'POST',
        failure: 'net::ERR_FAILED',
        url: 'https://staging.example.test/api/save',
      },
      { seq: 4, tabId: 'tab-1', method: 'GET', failure: 'failed', url: 'https://staging.example.test/x' },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('returns only failures and error statuses with errorsOnly, and registers the whole log as evidence', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseResponse({ method: 'GET', url: 'https://staging.example.test/ok', status: 200 });
    harness.launcher.raiseResponse({
      method: 'GET',
      url: 'https://staging.example.test/missing',
      status: 404,
    });
    harness.launcher.raiseResponse({
      method: 'GET',
      url: 'https://staging.example.test/redirect',
      status: 399,
    });
    harness.launcher.raiseRequestFailed({
      method: 'GET',
      url: 'https://staging.example.test/down',
      errorText: 'x',
    });

    const result = await runBrowserNetwork(harness.context, {
      sessionId,
      errorsOnly: true,
      stepId: 'step-1',
    });

    expect(result.entries.map((entry) => entry.seq)).toEqual([2, 4]);
    expect(result.evidence).toMatchObject({ kind: 'other', stepId: 'step-1' });
    expect(result.evidence.path.endsWith('.json')).toBe(true);
    expect(evidenceJson(harness, result.evidence.path) as { entries: unknown[]; log: string }).toMatchObject({
      log: 'network',
    });
    expect((evidenceJson(harness, result.evidence.path) as { entries: unknown[] }).entries).toHaveLength(4);
  });

  it('caps the templated URL it returns', async () => {
    const { harness, sessionId } = await openHarness();
    harness.launcher.raiseResponse({
      method: 'GET',
      url: `https://staging.example.test${'/segment'.repeat(60)}`,
      status: 200,
    });

    const result = await runBrowserNetwork(harness.context, { sessionId });

    expect(result.entries[0]?.url.length).toBe(201);
  });

  it('reads only what came after a cursor, and counts events a full log already dropped', async () => {
    const { harness, sessionId } = await openHarness();
    for (let index = 0; index < 505; index += 1) {
      harness.launcher.raiseResponse({ method: 'GET', url: 'https://staging.example.test/a', status: 200 });
    }

    const result = await runBrowserNetwork(harness.context, { sessionId, since: 2, limit: 100 });

    expect(result.missedCount).toBe(3);
    expect(result.omittedCount).toBe(400);
    expect(result.cursor).toBe(result.entries.at(-1)?.seq);
  });
});
