// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_VIEW_BEGIN_MARKER, PAGE_VIEW_END_MARKER } from '../page-view.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserClick } from './browser-click.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserSnapshot } from './browser-snapshot.js';

interface Tree {
  role: string;
  name?: string;
  children: { role: string; name?: string }[];
}

function pageWith(...children: Tree['children']): Tree {
  return { role: 'document', name: 'Orders', children };
}

async function openOn(tree: Tree) {
  const harness = createBrowserTestHarness({ launcherOptions: { ariaSnapshotResult: tree } });
  const { sessionId } = await runBrowserOpen(harness.context);
  return { harness, sessionId };
}

describe('runBrowserSnapshot with since (P6-54)', () => {
  it('returns only the lines added or removed since the earlier snapshot', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' }, { role: 'heading', name: 'Orders' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });
    tree.children.push({ role: 'dialog', name: 'Terms' }, { role: 'button', name: 'Accept' });
    tree.children.shift();

    const second = await runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId });

    expect(second.view.text.split('\n')).toEqual([
      PAGE_VIEW_BEGIN_MARKER,
      '-   - button "Save"',
      '+   - dialog "Terms"',
      '+   - button "Accept" [ref=e2]',
      PAGE_VIEW_END_MARKER,
    ]);
    expect(second.diff).toEqual({
      since: first.snapshotId,
      addedCount: 2,
      removedCount: 1,
      unchangedCount: 2,
    });
    expect(second.snapshotId).not.toBe(first.snapshotId);
  });

  it('still registers the full tree of the diff snapshot as evidence', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });

    const second = await runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId });

    expect(second.accessibilityTree.id).toBe(second.snapshotId);
    expect(harness.fs.getRawFile(join('project', '.qa', second.accessibilityTree.path))).toBeDefined();
    expect(second.diff).toMatchObject({ addedCount: 0, removedCount: 0, unchangedCount: 2 });
  });

  it('keeps the ref of an unchanged element, so the ref the agent already holds still works', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });
    expect(first.view.text).toContain('button "Save" [ref=e1]');
    tree.children.push({ role: 'link', name: 'Help' });

    const second = await runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId });

    expect(second.view.text).toContain('+   - link "Help" [ref=e2]');
    const clicked = await runBrowserClick(harness.context, { sessionId, ref: 'e1' });
    expect(clicked.selector).toBe('role=button[name="Save"s]');
  });

  it('never hands out a number a diff already used', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });
    tree.children.push({ role: 'link', name: 'Help' });
    const second = await runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId });
    tree.children.push({ role: 'link', name: 'About' });

    const third = await runBrowserSnapshot(harness.context, { sessionId, since: second.snapshotId });

    expect(third.view.text).toContain('+   - link "About" [ref=e3]');
  });

  it('reports a name or state change as one line gone and one line new', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });
    tree.children = [{ role: 'button', name: 'Saved' }];

    const second = await runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId });

    expect(second.diff).toMatchObject({ addedCount: 1, removedCount: 1 });
  });

  it('fails with BROWSER_SNAPSHOT_UNKNOWN for an id it does not have, before capturing anything', async () => {
    const { harness, sessionId } = await openOn(pageWith({ role: 'button', name: 'Save' }));

    await expect(
      runBrowserSnapshot(harness.context, { sessionId, since: 'evidence-nope', screenshot: true }),
    ).rejects.toMatchObject({ code: 'BROWSER_SNAPSHOT_UNKNOWN' });
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'screenshot')).toEqual([]);
  });

  it('refuses a snapshot id that belongs to another session', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const other = await runBrowserOpen(harness.context);
    const foreign = await runBrowserSnapshot(harness.context, { sessionId: other.sessionId });

    await expect(
      runBrowserSnapshot(harness.context, { sessionId, since: foreign.snapshotId }),
    ).rejects.toMatchObject({ code: 'BROWSER_SNAPSHOT_UNKNOWN' });
  });

  it('forgets the oldest snapshots after the first five', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });
    for (let count = 0; count < 5; count += 1) {
      await runBrowserSnapshot(harness.context, { sessionId });
    }

    await expect(
      runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId }),
    ).rejects.toMatchObject({ code: 'BROWSER_SNAPSHOT_UNKNOWN' });
  });

  it('numbers a plain snapshot after a diff past every ref in use', async () => {
    const tree = pageWith({ role: 'button', name: 'Save' });
    const { harness, sessionId } = await openOn(tree);
    const first = await runBrowserSnapshot(harness.context, { sessionId });
    tree.children.push({ role: 'link', name: 'Help' });
    await runBrowserSnapshot(harness.context, { sessionId, since: first.snapshotId });

    const plain = await runBrowserSnapshot(harness.context, { sessionId });

    expect(plain.view.text).toContain('button "Save" [ref=e3]');
    expect(plain.diff).toBeUndefined();
  });
});
