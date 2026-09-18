// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeStaticSource } from '../src/analyze-static-source.js';
import {
  buildMissingTestIdReport,
  renderMissingTestIdReportMarkdown,
} from '../src/build-missing-test-id-report.js';

// Exercises the full P1-12 -> P1-13 chain against real project source, the same demo-app views
// analyze-static-source-demo-app.test.ts validates static analysis against: neither view has a
// single `data-testid`, so every interactive element static analysis finds is expected to be
// missing one (AGENTS.md section 13; issue #28's exit criterion, "on the demo app").
describe('buildMissingTestIdReport (demo app)', () => {
  it('reports every field in the login and new-task forms, each with its file and line', async () => {
    const views = ['examples/demo-app/src/views/login.ejs', 'examples/demo-app/src/views/tasks-new.ejs'];
    const files = await Promise.all(
      views.map(async (filePath) => ({
        filePath,
        content: await readFile(fileURLToPath(new URL(`../../../${filePath}`, import.meta.url)), 'utf8'),
      })),
    );

    const { elements } = analyzeStaticSource({ files });
    const report = buildMissingTestIdReport({
      schemaVersion: 1,
      generatedAt: '2026-09-18T00:00:00Z',
      elements: [...elements],
    });

    expect(report.entries.length).toBe(elements.length);
    expect(report.entries.every((entry) => entry.sourceLocation !== undefined)).toBe(true);
    expect(new Set(report.entries.map((entry) => entry.sourceLocation?.filePath))).toEqual(new Set(views));

    const markdown = renderMissingTestIdReportMarkdown(report);
    expect(markdown).toContain('## examples/demo-app/src/views/login.ejs');
    expect(markdown).toContain('## examples/demo-app/src/views/tasks-new.ejs');
    expect(markdown).not.toContain('## Unknown source');
  });
});
