// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { FakeLocatorEvaluateCall } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it } from 'vitest';
import {
  createBrowserTestHarness,
  type BrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import type { ElementReading } from '../expectation.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserSnapshot } from './browser-snapshot.js';
import { runBrowserWaitFor, type BrowserWaitForOptions } from './browser-wait-for.js';

const SHOWN: ElementReading = {
  visible: true,
  text: 'Task saved',
  value: null,
  checked: null,
  inputType: null,
};
const HIDDEN: ElementReading = { ...SHOWN, visible: false };

interface Options {
  readonly counts?: readonly number[];
  readonly readings?: readonly unknown[];
  readonly tree?: unknown;
}

async function openSession(options: Options = {}) {
  let reads = 0;
  const readings = options.readings ?? [SHOWN];
  const harness = createBrowserTestHarness({
    launcherOptions: {
      locatorCounts: options.counts ?? [1],
      ariaSnapshotResult: options.tree,
      locatorEvaluate: ({ functionName }: FakeLocatorEvaluateCall) => {
        if (functionName !== 'readElementState') {
          return undefined;
        }
        const reading = readings[Math.min(reads, readings.length - 1)];
        reads += 1;
        if (reading instanceof Error) {
          throw reading;
        }
        return reading;
      },
    },
  });
  const { sessionId } = await runBrowserOpen(harness.context);
  await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/tasks' });
  return { harness, sessionId };
}

function sleeps(harness: BrowserTestHarness): number {
  return harness.launcher.pageCalls.filter((call) => call.method === 'evaluate').length;
}

function waitOptions(
  sessionId: string,
  overrides: Partial<BrowserWaitForOptions> & Pick<BrowserWaitForOptions, 'condition'>,
): BrowserWaitForOptions {
  return { sessionId, timeoutMs: 0, ...overrides };
}

describe('runBrowserWaitFor', () => {
  it('returns at once for a condition that already holds and registers what it waited for', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'visible', selector: '#status', stepId: 'step-2' }),
    );

    expect(result).toMatchObject({ condition: 'visible', selector: '#status', waitedMs: 0 });
    expect(sleeps(harness)).toBe(0);
    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'wait-for',
      sessionId,
      stepId: 'step-2',
      url: 'https://staging.example.test/tasks',
      selector: '#status',
      wait: { condition: 'visible', waitedMs: 0 },
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('keeps looking until an element becomes visible', async () => {
    const { harness, sessionId } = await openSession({ readings: [HIDDEN, HIDDEN, SHOWN] });

    const result = await runBrowserWaitFor(harness.context, {
      sessionId,
      condition: 'visible',
      selector: '#status',
      timeoutMs: 5000,
    });

    expect(result.condition).toBe('visible');
    expect(sleeps(harness)).toBe(2);
  });

  it('waits for an element to become hidden, which an absent element also is', async () => {
    const { harness, sessionId } = await openSession({ counts: [0] });

    const result = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'hidden', selector: '#spinner' }),
    );

    expect(result.condition).toBe('hidden');
  });

  it('waits for an element to be attached and to be detached', async () => {
    const attached = await openSession({ counts: [3] });
    const detached = await openSession({ counts: [0] });

    const first = await runBrowserWaitFor(
      attached.harness.context,
      waitOptions(attached.sessionId, { condition: 'attached', selector: 'tr' }),
    );
    const second = await runBrowserWaitFor(
      detached.harness.context,
      waitOptions(detached.sessionId, { condition: 'detached', selector: 'tr' }),
    );

    expect(first.condition).toBe('attached');
    expect(second.condition).toBe('detached');
    expect(attached.harness.launcher.pageCalls.filter((call) => call.method === 'locatorEvaluate')).toEqual(
      [],
    );
  });

  it('waits for text on the whole page when no element is named', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'text-appears', expected: 'saved' }),
    );

    expect(result).not.toHaveProperty('selector');
    expect(harness.launcher.pageCalls.find((call) => call.method === 'locator')?.args).toEqual(['body']);
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))),
    ).toMatchObject({ wait: { condition: 'text-appears', expected: 'saved' } });
  });

  it('waits for text inside one element, in full when asked', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, {
        condition: 'text-appears',
        selector: '#status',
        expected: 'Task saved',
        exact: true,
      }),
    );

    expect(result.selector).toBe('#status');
  });

  it('waits for text to disappear: from the page, or because its element is gone', async () => {
    const left = await openSession({ readings: [SHOWN, { ...SHOWN, text: 'Loading' }] });
    const gone = await openSession({ counts: [0] });

    const fromPage = await runBrowserWaitFor(left.harness.context, {
      sessionId: left.sessionId,
      condition: 'text-disappears',
      expected: 'saved',
      timeoutMs: 5000,
    });
    const withElement = await runBrowserWaitFor(
      gone.harness.context,
      waitOptions(gone.sessionId, { condition: 'text-disappears', selector: '#toast', expected: 'saved' }),
    );

    expect(fromPage.condition).toBe('text-disappears');
    expect(sleeps(left.harness)).toBe(1);
    expect(withElement.selector).toBe('#toast');
  });

  it('treats an element that vanishes between being counted and being read as gone', async () => {
    const { harness, sessionId } = await openSession({
      counts: [1, 0],
      readings: [new Error('element detached')],
    });

    const result = await runBrowserWaitFor(harness.context, {
      sessionId,
      condition: 'text-disappears',
      selector: '#going',
      expected: 'Loading',
      timeoutMs: 5000,
    });

    expect(result.condition).toBe('text-disappears');
    expect(sleeps(harness)).toBe(1);
  });

  it('does not take text to have gone from a scope that matches several elements', async () => {
    const { harness, sessionId } = await openSession({ counts: [2] });

    await expect(
      runBrowserWaitFor(
        harness.context,
        waitOptions(sessionId, { condition: 'text-disappears', selector: 'li', expected: 'saved' }),
      ),
    ).rejects.toMatchObject({ code: 'BROWSER_WAIT_TIMEOUT' });
  });

  it('waits for the URL, by containment or in full', async () => {
    const { harness, sessionId } = await openSession();

    const part = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'url', expected: '/tasks' }),
    );
    const full = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, {
        condition: 'url',
        expected: 'https://staging.example.test/tasks',
        exact: true,
      }),
    );

    expect(part.url).toBe('https://staging.example.test/tasks');
    expect(full.condition).toBe('url');
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'locator')).toEqual([]);
  });

  it('names the condition when it never holds, and registers nothing', async () => {
    const { harness, sessionId } = await openSession({ counts: [0] });

    const failure = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'text-appears', selector: '#toast', expected: 'Saved' }),
    ).catch((caught: unknown) => caught);

    expect(failure).toMatchObject({ code: 'BROWSER_WAIT_TIMEOUT' });
    expect((failure as Error).message).toContain('"text-appears" "Saved" on "#toast"');
    expect((failure as Error).message).toContain('https://staging.example.test/tasks');
  });

  it('names a condition that has no text or element in the timeout message', async () => {
    const { harness, sessionId } = await openSession({ counts: [0] });

    const failure = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'visible', selector: '#x' }),
    ).catch((caught: unknown) => caught);

    expect((failure as Error).message).toContain('"visible" on "#x"');
  });

  it('never waits longer than the environment action timeout', async () => {
    const { harness, sessionId } = await openSession({ counts: [0] });

    await expect(
      runBrowserWaitFor(harness.context, {
        sessionId,
        condition: 'visible',
        selector: '#x',
        timeoutMs: 400,
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_WAIT_TIMEOUT' });
    expect(sleeps(harness)).toBe(4);
  });

  it('defaults to the environment action timeout', async () => {
    const { harness, sessionId } = await openSession({ counts: [0] });

    await expect(
      runBrowserWaitFor(harness.context, { sessionId, condition: 'attached', selector: '#x' }),
    ).rejects.toMatchObject({ code: 'BROWSER_WAIT_TIMEOUT' });
    expect(sleeps(harness)).toBe(300);
  });

  it('names an element by a snapshot ref and records both', async () => {
    const { harness, sessionId } = await openSession({
      tree: { role: 'document', children: [{ role: 'button', name: 'Save' }] },
    });
    await runBrowserSnapshot(harness.context, { sessionId });

    const result = await runBrowserWaitFor(
      harness.context,
      waitOptions(sessionId, { condition: 'visible', ref: 'e1' }),
    );

    expect(result.selector).toBe('role=button[name="Save"s]');
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))),
    ).toMatchObject({ ref: { id: 'e1', role: 'button', name: 'Save' } });
  });

  it.each([
    ['text-appears', undefined],
    ['text-appears', ''],
    ['url', undefined],
  ] as const)('rejects %s without text to wait for (%s)', async (condition, expected) => {
    const { harness, sessionId } = await openSession();

    await expect(
      runBrowserWaitFor(harness.context, {
        sessionId,
        condition,
        ...(expected === undefined ? {} : { expected }),
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_WAIT_INVALID' });
  });

  it('rejects an element condition given text to wait for', async () => {
    const { harness, sessionId } = await openSession();

    await expect(
      runBrowserWaitFor(harness.context, {
        sessionId,
        condition: 'visible',
        selector: '#x',
        expected: 'hello',
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_WAIT_INVALID' });
  });

  it('rejects an element condition without an element, and a URL given one', async () => {
    const { harness, sessionId } = await openSession();

    await expect(
      runBrowserWaitFor(harness.context, { sessionId, condition: 'visible' }),
    ).rejects.toMatchObject({ code: 'BROWSER_TARGET_INVALID' });
    await expect(
      runBrowserWaitFor(harness.context, {
        sessionId,
        condition: 'url',
        expected: '/tasks',
        selector: '#x',
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_TARGET_INVALID' });
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserWaitFor(harness.context, {
        sessionId: 'session-gone',
        condition: 'url',
        expected: '/',
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});
