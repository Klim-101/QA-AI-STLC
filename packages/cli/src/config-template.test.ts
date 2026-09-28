// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ConfigSchema, isLocalOverridableConfigSection, type TestingScope } from '@qa-ai-stlc/schemas';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CONFIG_LOCAL_EXAMPLE, QA_GITIGNORE, renderConfigYaml } from './config-template.js';

const ALL_UNDECIDED: TestingScope = {
  e2e: 'undecided',
  api: 'undecided',
  a11y: 'undecided',
  security: 'undecided',
};

describe('renderConfigYaml', () => {
  it('parses as YAML and validates against ConfigSchema', () => {
    const parsed: unknown = parseYaml(renderConfigYaml({ testing: ALL_UNDECIDED }));
    const result = ConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('writes the given testing scope decisions verbatim', () => {
    const testing: TestingScope = {
      e2e: 'in-scope',
      api: 'out-of-scope',
      a11y: 'undecided',
      security: 'in-scope',
    };

    const parsed = ConfigSchema.parse(parseYaml(renderConfigYaml({ testing })));

    expect(parsed.testing).toStrictEqual(testing);
  });

  it('omits source and api blocks by default', () => {
    const parsed = ConfigSchema.parse(parseYaml(renderConfigYaml({ testing: ALL_UNDECIDED })));

    expect(parsed.source).toBeUndefined();
    expect(parsed.api).toBeUndefined();
  });

  it('writes a source block when sourcePath is given', () => {
    const parsed = ConfigSchema.parse(
      parseYaml(renderConfigYaml({ testing: ALL_UNDECIDED, sourcePath: 'app-src' })),
    );

    expect(parsed.source).toStrictEqual({ path: 'app-src' });
  });

  it('writes an OpenAPI api block when apiSource is given', () => {
    const parsed = ConfigSchema.parse(
      parseYaml(
        renderConfigYaml({
          testing: { ...ALL_UNDECIDED, api: 'in-scope' },
          apiSource: './openapi.yaml',
        }),
      ),
    );

    expect(parsed.api).toStrictEqual({ contract: 'openapi', source: './openapi.yaml' });
  });

  it('writes flaky detection thresholds', () => {
    const parsed = ConfigSchema.parse(parseYaml(renderConfigYaml({ testing: ALL_UNDECIDED })));

    expect(parsed.flaky).toStrictEqual({ historyWindow: 10, minStatusChanges: 2 });
  });

  it('safely quotes a path containing YAML-special characters', () => {
    const parsed = ConfigSchema.parse(
      parseYaml(renderConfigYaml({ testing: ALL_UNDECIDED, sourcePath: 'weird: "path"' })),
    );

    expect(parsed.source).toStrictEqual({ path: 'weird: "path"' });
  });
});

describe('QA_GITIGNORE', () => {
  it('ignores every runtime-only subdirectory', () => {
    expect(QA_GITIGNORE).toContain('/runs/');
    expect(QA_GITIGNORE).toContain('/evidence/');
    expect(QA_GITIGNORE).toContain('/auth/');
    expect(QA_GITIGNORE).toContain('/verifications/');
  });

  it('ignores the local configuration layer', () => {
    expect(QA_GITIGNORE).toContain('/config.local.yaml');
  });
});

describe('CONFIG_LOCAL_EXAMPLE', () => {
  it('has every line commented out, so the file is inert if ever loaded by name', () => {
    for (const line of CONFIG_LOCAL_EXAMPLE.split('\n')) {
      if (line.trim().length > 0) {
        expect(line.trimStart().startsWith('#')).toBe(true);
      }
    }
  });

  it('shows only local-overridable top-level sections (ADR-011)', () => {
    const commentedSections = [...CONFIG_LOCAL_EXAMPLE.matchAll(/^#\s([a-zA-Z]+):\s*$/gm)].map(
      (match) => match[1]!,
    );

    expect(commentedSections).toStrictEqual(['environments', 'identities', 'source', 'agents']);
    for (const name of commentedSections) {
      expect(isLocalOverridableConfigSection(name)).toBe(true);
    }
  });

  it('never shows a committed-only section such as testing or selectors', () => {
    expect(CONFIG_LOCAL_EXAMPLE).not.toMatch(/^#\s(testing|selectors|data|api|flaky|evidence):\s*$/m);
  });

  it('parses as valid YAML once uncommented, and validates as a config fragment', () => {
    const startIndex = CONFIG_LOCAL_EXAMPLE.indexOf('# environments:');
    const uncommented = CONFIG_LOCAL_EXAMPLE.slice(startIndex)
      .split('\n')
      .map((line) => line.replace(/^#\s?/, ''))
      .join('\n');

    const parsed = parseYaml(uncommented) as Readonly<Record<string, unknown>>;

    expect(Object.keys(parsed)).toStrictEqual(['environments', 'identities', 'source', 'agents']);
  });
});
