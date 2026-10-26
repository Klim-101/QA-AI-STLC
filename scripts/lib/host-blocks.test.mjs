// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { renderForHost } from './host-blocks.mjs';

const SOURCE = [
  'shared start',
  '<!-- host: claude-code -->',
  'claude only',
  '<!-- host: codex -->',
  'codex only',
  '<!-- /host -->',
  'shared end',
].join('\n');

describe('renderForHost', () => {
  it('keeps the shared text and the branch of the requested host', () => {
    expect(renderForHost(SOURCE, 'claude-code')).toBe('shared start\nclaude only\nshared end');
    expect(renderForHost(SOURCE, 'codex')).toBe('shared start\ncodex only\nshared end');
  });

  it('gives a host with no branch nothing from the group', () => {
    const onlyClaude = 'a\n<!-- host: claude-code -->\nb\n<!-- /host -->\nc';

    expect(renderForHost(onlyClaude, 'codex')).toBe('a\nc');
  });

  it('does not leave doubled blank lines where Prettier put a blank after a marker', () => {
    const formatted = [
      ...['a', '', '<!-- host: claude-code -->', '', 'b', '', '<!-- host: codex -->', '', 'c'],
      ...['<!-- /host -->', '', 'd'],
    ].join('\n');

    expect(renderForHost(formatted, 'claude-code')).toBe('a\n\nb\n\nd');
    expect(renderForHost(formatted, 'codex')).toBe('a\n\nc\n\nd');
  });

  it('returns text without markers unchanged', () => {
    expect(renderForHost('plain\ntext\n', 'codex')).toBe('plain\ntext\n');
  });

  it('rejects an unknown host to render for', () => {
    expect(() => renderForHost('x', 'vim')).toThrow('Unknown host "vim"');
  });

  it('rejects an unknown host in a marker, naming the position', () => {
    expect(() => renderForHost('a\n<!-- host: vim -->\nb', 'codex', 'HUB.md')).toThrow(
      'HUB.md:2: unknown host "vim"',
    );
  });

  it('rejects a close without an open group', () => {
    expect(() => renderForHost('a\n<!-- /host -->', 'codex', 'HUB.md')).toThrow('HUB.md:2');
  });

  it('rejects a group that is never closed', () => {
    expect(() => renderForHost('<!-- host: codex -->\nb', 'codex', 'HUB.md')).toThrow('never closed');
  });
});
