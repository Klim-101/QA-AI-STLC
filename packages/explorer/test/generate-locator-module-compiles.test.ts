// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@qa-ai-stlc/schemas';
import type { SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { generateLocatorModule } from '../src/generate-locator-module.js';

// Node's (and TypeScript's) module resolution for a bare specifier like `playwright` walks up
// from the *file being compiled*, not from the process cwd. The temp file therefore has to live
// under this package, where that walk reaches the workspace root's hoisted node_modules and the
// nearest package.json ("type": "module") for correct NodeNext format detection; a bare OS temp
// directory would resolve neither. `playwright` (the full package, distinct from `core`'s own
// `playwright-core` runtime dependency, #333) is a root devDependency for exactly this: the
// generated `locators.ts` this test compiles imports its real published types, matching what an
// operator's own project resolves at their own build time.
const TSC_BIN = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));

function runTsc(filePath: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        TSC_BIN,
        '--noEmit',
        '--strict',
        '--noUncheckedIndexedAccess',
        '--exactOptionalPropertyTypes',
        '--target',
        'ES2023',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--lib',
        'ES2023',
        '--skipLibCheck',
        '--ignoreConfig',
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, output });
    });
  });
}

function registry(elements: SelectorRegistry['elements']): SelectorRegistry {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-18T00:00:00Z', elements };
}

describe('generateLocatorModule (compiles under strict TypeScript)', () => {
  it('produces a locators.ts that tsc accepts under the project strict settings', async () => {
    const { source, missingLocators } = generateLocatorModule(
      registry([
        {
          elementId: 'a',
          name: 'logIn',
          kind: 'button',
          locatorCandidates: [{ strategy: 'testId', value: 'login-button', fragile: false }],
          stabilityScore: 1,
          lastVerifiedAt: '2026-09-18T00:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
        {
          elementId: 'b',
          name: 'submit',
          kind: 'button',
          locatorCandidates: [
            { strategy: 'role', value: JSON.stringify({ role: 'button', name: 'Submit' }), fragile: false },
          ],
          stabilityScore: 1,
          lastVerifiedAt: '2026-09-18T00:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
        {
          elementId: 'c',
          name: 'email',
          kind: 'textbox',
          locatorCandidates: [
            { strategy: 'label', value: 'Email', fragile: false },
            { strategy: 'css', value: '#email', fragile: true },
          ],
          stabilityScore: 0.5,
          lastVerifiedAt: '2026-09-18T00:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
      ]),
      { generatorVersion: '0.3.0' },
    );
    expect(missingLocators).toEqual([]);

    const testDirectory = fileURLToPath(new URL('.', import.meta.url));
    const tempDirectory = await mkdtemp(join(testDirectory, '.tmp-locators-'));
    try {
      const filePath = join(tempDirectory, 'locators.ts');
      await writeFile(filePath, source, 'utf8');

      const { exitCode, output } = await runTsc(filePath);

      expect(output).toBe('');
      expect(exitCode).toBe(0);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
