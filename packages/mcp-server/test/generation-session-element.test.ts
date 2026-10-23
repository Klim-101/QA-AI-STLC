// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SCHEMA_VERSION, type SelectorElement, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generationSpokeInputTool } from '../src/tools/generation-spoke-input.js';

const SESSION_ELEMENT: SelectorElement = {
  elementId: 'el-session-heading',
  name: 'productHeading',
  kind: 'heading',
  locatorCandidates: [{ strategy: 'text', value: 'Backpack', fragile: false }],
  stabilityScore: 1,
  lastVerifiedAt: '2026-09-18T00:00:00Z',
  pii: false,
  dynamicText: false,
  source: 'execute',
  pageUrl: 'https://staging.example.com/products',
};

// A module `qa explore` wrote before the session registered `SESSION_ELEMENT`: it carries a
// generator stamp, and exports nothing for the new element.
const STALE_LOCATOR_MODULE = [
  '// Copyright The QA-AI-STLC Authors',
  'export const GENERATOR_VERSION = "0.0.0";',
  '',
].join('\n');

describe('qa.generation_spoke_input with an element registered during a session', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  // Leaves the temp directory before it is removed: Windows cannot delete the working directory.
  async function withProject(run: (projectRoot: string) => Promise<void>): Promise<void> {
    await withTempDir(async (directory) => {
      process.chdir(directory);
      try {
        await run(directory);
      } finally {
        process.chdir(originalCwd);
      }
    });
  }

  async function writeProjectFile(projectRoot: string, path: string, content: string): Promise<void> {
    await mkdir(dirname(join(projectRoot, path)), { recursive: true });
    await writeFile(join(projectRoot, path), content, 'utf-8');
  }

  it('lists the session element among the locator module exports, without a new crawl', async () => {
    await withProject(async (projectRoot) => {
      const registry: SelectorRegistry = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: '2026-09-18T00:00:00Z',
        elements: [SESSION_ELEMENT],
      };
      await writeProjectFile(projectRoot, '.qa/selectors/registry.json', JSON.stringify(registry));
      await writeProjectFile(
        projectRoot,
        '.qa/artifacts/cases/catalog/catalog-list.json',
        JSON.stringify({
          id: 'catalog-list',
          feature: 'catalog',
          requirementIds: ['catalog'],
          testType: 'e2e',
          title: 'The catalog lists products',
          steps: [{ description: 'Open the catalog' }],
          expectedResult: 'A product heading is shown',
          status: 'approved',
          createdAt: '2026-09-18T00:00:00Z',
        }),
      );
      await writeProjectFile(projectRoot, 'tests/qa/locators.ts', STALE_LOCATOR_MODULE);

      const input = await generationSpokeInputTool.handler({
        testCaseId: 'catalog-list',
        elementIds: [SESSION_ELEMENT.elementId],
      });

      expect(input.locatorModule?.exports).toStrictEqual([
        { elementId: 'el-session-heading', name: 'productHeading' },
      ]);
      expect(await readFile(join(projectRoot, 'tests', 'qa', 'locators.ts'), 'utf-8')).toContain(
        'export function productHeading(page: Page)',
      );
    });
  });
});
