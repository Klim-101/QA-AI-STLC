// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { FakeLocatorEvaluateCall } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
  type BrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import type { ElementReading } from '../expectation.js';
import { runBrowserExpect, type BrowserExpectOptions } from './browser-expect.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserSnapshot } from './browser-snapshot.js';

const READING: ElementReading = {
  visible: true,
  text: 'Task saved',
  value: 'casey',
  checked: true,
  inputType: 'text',
};

interface Options {
  readonly counts?: readonly number[];
  readonly readings?: readonly unknown[];
  readonly configYaml?: string;
  readonly tree?: unknown;
}

async function openSession(options: Options = {}) {
  let reads = 0;
  const readings = options.readings ?? [READING];
  const harness = createBrowserTestHarness({
    ...(options.configYaml === undefined ? {} : { configYaml: options.configYaml }),
    launcherOptions: {
      locatorCounts: options.counts ?? [1],
      ariaSnapshotResult: options.tree,
      locatorEvaluate: ({ functionName }: FakeLocatorEvaluateCall) => {
        if (functionName !== 'readElementState') {
          return undefined;
        }
        const reading = readings[Math.min(reads, readings.length - 1)];
        reads += 1;
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

function readEvidence(harness: BrowserTestHarness, path: string): Record<string, unknown> {
  return JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', path)))) as Record<string, unknown>;
}

function expectOptions(
  sessionId: string,
  overrides: Partial<BrowserExpectOptions> & Pick<BrowserExpectOptions, 'kind'>,
): BrowserExpectOptions {
  return { sessionId, timeoutMs: 0, ...overrides };
}

describe('runBrowserExpect', () => {
  it('passes on the first look and registers what the page showed with the verdict', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'text', selector: '#status', expected: 'saved', stepId: 'step-4' }),
    );

    expect(result).toMatchObject({
      kind: 'text',
      selector: '#status',
      passed: true,
      expected: 'saved',
      observed: 'Task saved',
      matchCount: 1,
      url: 'https://staging.example.test/tasks',
    });
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({
      type: 'expect',
      selector: '#status',
      stepId: 'step-4',
      expectation: { kind: 'text', passed: true, expected: 'saved', observed: 'Task saved', matchCount: 1 },
    });
    expect(sleeps(harness)).toBe(0);
  });

  it('keeps looking until the expectation holds', async () => {
    const { harness, sessionId } = await openSession({ counts: [0, 0, 1] });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'visible', selector: '#status', timeoutMs: 1000 }),
    );

    expect(result).toMatchObject({ passed: true, observed: 'visible', matchCount: 1 });
    expect(sleeps(harness)).toBe(2);
  });

  it('returns a failed expectation with the observed value, and registers it as well', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'value', selector: '#assignee', expected: 'avery' }),
    );

    expect(result).toMatchObject({ passed: false, expected: 'avery', observed: 'casey' });
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({
      expectation: { kind: 'value', passed: false, expected: 'avery', observed: 'casey' },
    });
  });

  it('gives up after the wait and reports the last look', async () => {
    const { harness, sessionId } = await openSession({ counts: [0] });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'visible', selector: '#status', timeoutMs: 250 }),
    );

    expect(result).toMatchObject({ passed: false, observed: 'absent', matchCount: 0 });
    expect(sleeps(harness)).toBe(3);
  });

  it('never waits longer than the session action timeout', async () => {
    const configYaml = BROWSER_TEST_CONFIG_YAML.replace(
      'allowlist: ["staging.example.test"] }',
      'allowlist: ["staging.example.test"], actionTimeoutMs: 200 }',
    );
    const { harness, sessionId } = await openSession({ counts: [0], configYaml });

    await runBrowserExpect(harness.context, {
      sessionId,
      kind: 'visible',
      selector: '#status',
      timeoutMs: 100_000,
    });
    expect(sleeps(harness)).toBe(2);

    const defaulted = await runBrowserExpect(harness.context, {
      sessionId,
      kind: 'visible',
      selector: '#status',
    });
    expect(defaulted.passed).toBe(false);
    expect(sleeps(harness)).toBe(4);
  });

  it('counts elements without reading any of them', async () => {
    const { harness, sessionId } = await openSession({ counts: [3] });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'count', selector: 'tr', expected: 3 }),
    );

    expect(result).toMatchObject({ passed: true, observed: 3, matchCount: 3 });
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'locatorEvaluate')).toEqual([]);
  });

  it('checks the page URL and takes no element', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'url', expected: '/tasks', exact: false }),
    );

    expect(result).toMatchObject({ passed: true, observed: 'https://staging.example.test/tasks' });
    expect(result.selector).toBeUndefined();
    expect(result.matchCount).toBeUndefined();
    const record = readEvidence(harness, result.evidence.path);
    expect(record.selector).toBeUndefined();
    expect(record.expectation).not.toHaveProperty('matchCount');
    await expect(
      runBrowserExpect(
        harness.context,
        expectOptions(sessionId, { kind: 'url', expected: '/tasks', selector: '#x' }),
      ),
    ).rejects.toMatchObject({ code: 'BROWSER_TARGET_INVALID' });
    await expect(
      runBrowserExpect(
        harness.context,
        expectOptions(sessionId, { kind: 'url', expected: '/tasks', ref: 'e1' }),
      ),
    ).rejects.toMatchObject({ code: 'BROWSER_TARGET_INVALID' });
  });

  it('defaults a checked expectation to checked', async () => {
    const { harness, sessionId } = await openSession();

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'checked', selector: '#a' }),
    );

    expect(result).toMatchObject({ passed: true, expected: true, observed: true });
  });

  it('resolves a ref and records both it and the selector it resolved to', async () => {
    const { harness, sessionId } = await openSession({ tree: { role: 'checkbox', name: 'Done' } });
    await runBrowserSnapshot(harness.context, { sessionId });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'checked', ref: 'e1', expected: true }),
    );

    expect(result.selector).toBe('role=checkbox[name="Done"s]');
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({
      selector: 'role=checkbox[name="Done"s]',
      ref: { id: 'e1', role: 'checkbox', name: 'Done' },
    });
  });

  it('refuses a stale ref without registering anything', async () => {
    const { harness, sessionId } = await openSession();
    const { runId } = await harness.sessions.get(sessionId);
    const directory = join('project', '.qa', 'evidence', runId);
    const before = await harness.fs.listFiles(directory);

    await expect(
      runBrowserExpect(harness.context, expectOptions(sessionId, { kind: 'visible', ref: 'e1' })),
    ).rejects.toMatchObject({ code: 'BROWSER_REF_STALE' });
    expect(await harness.fs.listFiles(directory)).toEqual(before);
  });

  it('never records what a password field holds, but still judges it', async () => {
    const { harness, sessionId } = await openSession({
      readings: [{ ...READING, value: 'hunter2!', inputType: 'password' }],
    });

    const passed = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'value', selector: '#password', expected: 'hunter2!' }),
    );
    const failed = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'value', selector: '#password', expected: 'other' }),
    );

    expect(passed).toMatchObject({ passed: true, expected: '[redacted]', observed: '[redacted]' });
    expect(failed).toMatchObject({ passed: false, expected: '[redacted]', observed: '[redacted]' });
    const stored = JSON.stringify(readEvidence(harness, failed.evidence.path));
    expect(stored).not.toContain('hunter2');
    expect(stored).not.toContain('other');
  });

  it('records a password field with nothing readable as redacted expected only', async () => {
    const { harness, sessionId } = await openSession({
      readings: [{ ...READING, value: null, inputType: 'password' }],
    });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'value', selector: '#password', expected: 'x' }),
    );

    expect(result).toMatchObject({ passed: false, expected: '[redacted]' });
    expect(result.observed).toBeUndefined();
  });

  it('caps long page text before it is returned or recorded', async () => {
    const { harness, sessionId } = await openSession({ readings: [{ ...READING, text: 'x'.repeat(500) }] });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'text', selector: '#status', expected: 'x' }),
    );

    expect(result.passed).toBe(true);
    expect(result.observed).toBe(`${'x'.repeat(200)}…`);
  });

  it('does not read an answer it cannot trust as an element that matched', async () => {
    const { harness, sessionId } = await openSession({ readings: [{ visible: 'yes' }] });

    const result = await runBrowserExpect(
      harness.context,
      expectOptions(sessionId, { kind: 'text', selector: '#status', expected: 'saved' }),
    );

    expect(result).toMatchObject({ passed: false, matchCount: 1 });
    expect(result.observed).toBeUndefined();
  });

  it.each([
    [{ kind: 'visible', expected: 'x' }, '"visible" takes no "expected"'],
    [{ kind: 'hidden', expected: true }, '"hidden" takes no "expected"'],
    [{ kind: 'text' }, '"text" needs "expected" as a string'],
    [{ kind: 'value', expected: 4 }, '"value" needs "expected" as a string'],
    [{ kind: 'url', expected: false }, '"url" needs "expected" as a string'],
    [{ kind: 'count' }, '"count" needs "expected" as a whole number'],
    [{ kind: 'count', expected: 1.5 }, '"count" needs "expected" as a whole number'],
    [{ kind: 'count', expected: -1 }, '"count" needs "expected" as a whole number'],
    [{ kind: 'checked', expected: 'yes' }, '"checked" needs "expected" as true or false'],
  ] as const)('refuses %j', async (options, message) => {
    const { harness, sessionId } = await openSession();

    await expect(
      runBrowserExpect(harness.context, { sessionId, selector: '#a', ...options }),
    ).rejects.toMatchObject({
      code: 'BROWSER_EXPECT_INVALID',
      message: expect.stringContaining(message) as string,
    });
  });

  it('requires exactly one of selector and ref for an element expectation', async () => {
    const { harness, sessionId } = await openSession();

    await expect(
      runBrowserExpect(harness.context, expectOptions(sessionId, { kind: 'visible' })),
    ).rejects.toMatchObject({ code: 'BROWSER_TARGET_INVALID' });
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserExpect(harness.context, { sessionId: 'session-gone', kind: 'url', expected: '/' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});
