// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { normalizeAccessibilityTree } from './accessibility-tree.js';

describe('normalizeAccessibilityTree', () => {
  it('normalizes a well-formed tree with children and boolean flags', () => {
    const { tree, truncated } = normalizeAccessibilityTree({
      role: 'document',
      name: 'Tasks',
      children: [{ role: 'button', name: 'New task', pressed: false, disabled: true }],
    });

    expect(tree).toEqual({
      role: 'document',
      name: 'Tasks',
      children: [{ role: 'button', name: 'New task', pressed: false, disabled: true }],
    });
    expect(truncated).toBe(false);
  });

  it('treats a bare string root as a text fragment', () => {
    const { tree, truncated } = normalizeAccessibilityTree('not a node');

    expect(tree).toEqual({ role: 'text', text: 'not a node' });
    expect(truncated).toBe(false);
  });

  it('falls back to a generic role for input that is neither an object nor a string', () => {
    const { tree, truncated } = normalizeAccessibilityTree(42);

    expect(tree).toEqual({ role: 'generic' });
    expect(truncated).toBe(false);
  });

  it('falls back to a generic role when the role field is missing or not a string', () => {
    const { tree } = normalizeAccessibilityTree({ name: 'no role here' });

    expect(tree.role).toBe('generic');
  });

  it('truncates a name over the text length limit and reports it', () => {
    const { tree, truncated } = normalizeAccessibilityTree(
      { role: 'heading', name: 'a very long heading text' },
      { maxTextLength: 5, maxArrayLength: 200, maxTreeNodes: 500 },
    );

    expect(tree).toEqual({ role: 'heading', name: 'a ver…' });
    expect(truncated).toBe(true);
  });

  it('truncates a text fragment the same way as a name', () => {
    const { tree, truncated } = normalizeAccessibilityTree(
      { role: 'text', text: 'a very long text fragment' },
      { maxTextLength: 5, maxArrayLength: 200, maxTreeNodes: 500 },
    );

    expect(tree).toEqual({ role: 'text', text: 'a ver…' });
    expect(truncated).toBe(true);
  });

  it('drops children beyond the node cap and reports truncation', () => {
    const { tree, truncated } = normalizeAccessibilityTree(
      {
        role: 'list',
        children: [{ role: 'listitem' }, { role: 'listitem' }, { role: 'listitem' }],
      },
      { maxTextLength: 200, maxArrayLength: 200, maxTreeNodes: 2 },
    );

    expect(tree.children).toHaveLength(1);
    expect(truncated).toBe(true);
  });

  it('unwraps a single-element root list, matching ariaSnapshotJSON()', () => {
    const { tree } = normalizeAccessibilityTree([{ role: 'main', name: 'Content' }]);

    expect(tree).toEqual({ role: 'main', name: 'Content' });
  });

  it('wraps a multi-element root list under a synthetic root', () => {
    const { tree } = normalizeAccessibilityTree([{ role: 'banner' }, { role: 'main' }]);

    expect(tree).toEqual({ role: 'root', children: [{ role: 'banner' }, { role: 'main' }] });
  });

  it('turns a bare string child into a text-role node', () => {
    const { tree } = normalizeAccessibilityTree({
      role: 'paragraph',
      children: ['Hello', { role: 'code', text: 'x' }],
    });

    expect(tree).toEqual({
      role: 'paragraph',
      children: [
        { role: 'text', text: 'Hello' },
        { role: 'code', text: 'x' },
      ],
    });
  });

  it('truncates a long bare string text fragment', () => {
    const { tree, truncated } = normalizeAccessibilityTree(
      { role: 'paragraph', children: ['a very long text fragment'] },
      { maxTextLength: 5, maxArrayLength: 200, maxTreeNodes: 500 },
    );

    expect(tree.children).toEqual([{ role: 'text', text: 'a ver…' }]);
    expect(truncated).toBe(true);
  });

  it('omits an empty children array from the result', () => {
    const { tree } = normalizeAccessibilityTree({ role: 'list', children: [] });

    expect(tree).toEqual({ role: 'list' });
  });

  it('falls back to a generic root when the root itself exceeds the node cap', () => {
    const { tree, truncated } = normalizeAccessibilityTree(
      { role: 'document' },
      { maxTextLength: 200, maxArrayLength: 200, maxTreeNodes: 0 },
    );

    expect(tree).toEqual({ role: 'generic' });
    expect(truncated).toBe(true);
  });

  it('ignores non-boolean flag values and non-array children', () => {
    const { tree } = normalizeAccessibilityTree({
      role: 'checkbox',
      checked: 'yes',
      children: 'not an array',
    });

    expect(tree).toEqual({ role: 'checkbox' });
  });
});
