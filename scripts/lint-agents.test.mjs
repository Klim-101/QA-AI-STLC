// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LINT_AGENTS = fileURLToPath(new URL('./lint-agents.mjs', import.meta.url));

describe('lint-agents', () => {
  it('passes on the shipped skills, hub, phase prompts and references', () => {
    const output = execFileSync(process.execPath, [LINT_AGENTS], { encoding: 'utf8' });

    expect(output).toContain('for link labels. All within limit.');
  });
});
