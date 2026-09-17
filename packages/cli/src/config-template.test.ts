// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ConfigSchema } from '@qa-ai-stlc/schemas';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CONFIG_TEMPLATE, QA_GITIGNORE } from './config-template.js';

describe('CONFIG_TEMPLATE', () => {
  it('parses as YAML and validates against ConfigSchema', () => {
    const parsed: unknown = parseYaml(CONFIG_TEMPLATE);
    const result = ConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('starts every testing type undecided', () => {
    const parsed = ConfigSchema.parse(parseYaml(CONFIG_TEMPLATE));
    expect(parsed.testing).toStrictEqual({
      e2e: 'undecided',
      api: 'undecided',
      a11y: 'undecided',
      security: 'undecided',
    });
  });
});

describe('QA_GITIGNORE', () => {
  it('ignores every runtime-only subdirectory', () => {
    expect(QA_GITIGNORE).toContain('/runs/');
    expect(QA_GITIGNORE).toContain('/evidence/');
    expect(QA_GITIGNORE).toContain('/auth/');
  });
});
