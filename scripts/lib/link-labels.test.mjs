// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findMismatchedLinkLabels } from './link-labels.mjs';

const SKILL_FILE = 'skills/qa-design-cases/SKILL.md';

describe('findMismatchedLinkLabels', () => {
  it('accepts a label that names the file the link points at, from the plugin root', () => {
    const markdown = 'See [`references/testing-standards.md`](../../references/testing-standards.md) first.';

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toEqual([]);
  });

  it('accepts a label written the way the link writes its target, relative to the file', () => {
    const markdown = [
      '[`references/web.md`](references/web.md)',
      '[`../../references/testing-standards.md`](../../references/testing-standards.md)',
    ].join('\n');

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toEqual([]);
  });

  it('rejects a label that starts with the source-tree folder the installed plugin lacks', () => {
    const markdown =
      'x\nSee [`agents/references/testing-standards.md`](../../references/testing-standards.md).';

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toEqual([
      {
        line: 2,
        label: 'agents/references/testing-standards.md',
        target: '../../references/testing-standards.md',
        resolved: 'references/testing-standards.md',
      },
    ]);
  });

  it('ignores an anchor on the target', () => {
    const markdown = '[`hub/HUB.md`](../../hub/HUB.md#announcing-what-comes-next)';

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toEqual([]);
  });

  it('compares only the folder when the label carries a placeholder', () => {
    const matching = '[`phase-prompts/<phase>.md`](../../phase-prompts)';
    const elsewhere = '[`references/<phase>.md`](../../phase-prompts)';

    expect(findMismatchedLinkLabels(matching, SKILL_FILE)).toEqual([]);
    expect(findMismatchedLinkLabels(elsewhere, SKILL_FILE)).toHaveLength(1);
  });

  it('resolves a target relative to the folder of the file that holds the link', () => {
    const markdown = '[`hub/HUB.md`](../hub/HUB.md) and [`phase-prompts/cases.md`](cases.md)';

    expect(findMismatchedLinkLabels(markdown, 'phase-prompts/scope.md')).toEqual([]);
  });

  it('reports a label that names a different file than the link target', () => {
    const markdown = '[`references/web.md`](../../references/component-libraries.md)';

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toHaveLength(1);
  });

  it('skips external links, in-page anchors and labels that are not paths', () => {
    const markdown = [
      '[`docs/guide`](https://example.com/docs/guide)',
      '[`a/b`](#section)',
      '[`qa.cases_add`](../../references/testing-standards.md)',
      '[references/x.md](../../references/other.md)',
    ].join('\n');

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toEqual([]);
  });

  it('checks every link on a line', () => {
    const markdown = '[`hub/HUB.md`](../../hub/HUB.md) and [`agents/hub/HUB.md`](../../hub/HUB.md)';

    expect(findMismatchedLinkLabels(markdown, SKILL_FILE)).toHaveLength(1);
  });
});
