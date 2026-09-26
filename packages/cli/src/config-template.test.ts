// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ConfigSchema, type TestingScope } from '@qa-ai-stlc/schemas';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { QA_GITIGNORE, renderConfigYaml } from './config-template.js';

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
  });
});
