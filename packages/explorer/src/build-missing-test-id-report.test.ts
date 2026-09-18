// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION } from '@qa-ai-stlc/schemas';
import type { SelectorElement, SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildMissingTestIdReport,
  renderMissingTestIdReportMarkdown,
} from './build-missing-test-id-report.js';

function selectorElement(overrides: Partial<SelectorElement> = {}): SelectorElement {
  return {
    elementId: 'a',
    kind: 'button',
    locatorCandidates: [],
    stabilityScore: 0,
    lastVerifiedAt: '2026-09-18T00:00:00Z',
    pii: false,
    dynamicText: false,
    source: 'crawl',
    ...overrides,
  };
}

function registry(elements: readonly SelectorElement[]): SelectorRegistry {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-18T00:00:00Z', elements: [...elements] };
}

describe('buildMissingTestIdReport', () => {
  it('omits an element that has a testId candidate', () => {
    const element = selectorElement({
      locatorCandidates: [{ strategy: 'testId', value: 'submit', fragile: false }],
    });

    const report = buildMissingTestIdReport(registry([element]));

    expect(report.entries).toEqual([]);
  });

  it('lists an element with candidates but none of them a testId', () => {
    const element = selectorElement({
      elementId: 'a',
      name: 'logIn',
      locatorCandidates: [{ strategy: 'role', value: '{"role":"button","name":"Log in"}', fragile: false }],
    });

    const report = buildMissingTestIdReport(registry([element]));

    expect(report.entries).toEqual([{ elementId: 'a', name: 'logIn', kind: 'button', source: 'crawl' }]);
  });

  it('includes the file and line for a static element with a source location', () => {
    const element = selectorElement({
      source: 'static',
      sourceLocation: { filePath: 'src/App.tsx', line: 12 },
    });

    const report = buildMissingTestIdReport(registry([element]));

    expect(report.entries).toEqual([
      {
        elementId: 'a',
        kind: 'button',
        source: 'static',
        sourceLocation: { filePath: 'src/App.tsx', line: 12 },
      },
    ]);
  });

  it('excludes a deprecated element even without a testId candidate', () => {
    const element = selectorElement({ deprecatedAt: '2026-09-17T00:00:00Z' });

    const report = buildMissingTestIdReport(registry([element]));

    expect(report.entries).toEqual([]);
  });

  it('sorts known-location entries by file then line, ahead of unknown-location entries', () => {
    const elements = [
      selectorElement({ elementId: 'unknown', name: 'z' }),
      selectorElement({
        elementId: 'b-late',
        source: 'static',
        sourceLocation: { filePath: 'src/B.tsx', line: 20 },
      }),
      selectorElement({
        elementId: 'a-early',
        source: 'static',
        sourceLocation: { filePath: 'src/A.tsx', line: 5 },
      }),
      selectorElement({
        elementId: 'b-early',
        source: 'static',
        sourceLocation: { filePath: 'src/B.tsx', line: 3 },
      }),
    ];

    const report = buildMissingTestIdReport(registry(elements));

    expect(report.entries.map((entry) => entry.elementId)).toEqual([
      'a-early',
      'b-early',
      'b-late',
      'unknown',
    ]);
  });

  it('sorts a known-location entry ahead of an unknown one regardless of input order', () => {
    const known = selectorElement({
      elementId: 'known',
      source: 'static',
      sourceLocation: { filePath: 'src/A.tsx', line: 1 },
    });
    const unknown = selectorElement({ elementId: 'unknown' });

    const knownFirst = buildMissingTestIdReport(registry([known, unknown]));
    const unknownFirst = buildMissingTestIdReport(registry([unknown, known]));

    expect(knownFirst.entries.map((entry) => entry.elementId)).toEqual(['known', 'unknown']);
    expect(unknownFirst.entries.map((entry) => entry.elementId)).toEqual(['known', 'unknown']);
  });

  it('sorts two known-location entries by file name regardless of input order', () => {
    const inA = selectorElement({
      elementId: 'in-a',
      source: 'static',
      sourceLocation: { filePath: 'src/A.tsx', line: 1 },
    });
    const inB = selectorElement({
      elementId: 'in-b',
      source: 'static',
      sourceLocation: { filePath: 'src/B.tsx', line: 1 },
    });

    expect(buildMissingTestIdReport(registry([inA, inB])).entries.map((e) => e.elementId)).toEqual([
      'in-a',
      'in-b',
    ]);
    expect(buildMissingTestIdReport(registry([inB, inA])).entries.map((e) => e.elementId)).toEqual([
      'in-a',
      'in-b',
    ]);
  });

  it('breaks a same-file tie by line regardless of input order', () => {
    const line3 = selectorElement({
      elementId: 'line-3',
      source: 'static',
      sourceLocation: { filePath: 'src/A.tsx', line: 3 },
    });
    const line9 = selectorElement({
      elementId: 'line-9',
      source: 'static',
      sourceLocation: { filePath: 'src/A.tsx', line: 9 },
    });

    expect(buildMissingTestIdReport(registry([line3, line9])).entries.map((e) => e.elementId)).toEqual([
      'line-3',
      'line-9',
    ]);
    expect(buildMissingTestIdReport(registry([line9, line3])).entries.map((e) => e.elementId)).toEqual([
      'line-3',
      'line-9',
    ]);
  });

  it('breaks a same-file-and-line tie by elementId', () => {
    const elements = [
      selectorElement({
        elementId: 'z',
        source: 'static',
        sourceLocation: { filePath: 'src/A.tsx', line: 3 },
      }),
      selectorElement({
        elementId: 'a',
        source: 'static',
        sourceLocation: { filePath: 'src/A.tsx', line: 3 },
      }),
    ];

    const report = buildMissingTestIdReport(registry(elements));

    expect(report.entries.map((entry) => entry.elementId)).toEqual(['a', 'z']);
  });

  it('sorts entries with no known location by elementId', () => {
    const elements = [selectorElement({ elementId: 'z' }), selectorElement({ elementId: 'a' })];

    const report = buildMissingTestIdReport(registry(elements));

    expect(report.entries.map((entry) => entry.elementId)).toEqual(['a', 'z']);
  });

  it('carries the registry generatedAt through to the report', () => {
    const report = buildMissingTestIdReport(registry([selectorElement()]));

    expect(report.generatedAt).toBe('2026-09-18T00:00:00Z');
  });
});

describe('renderMissingTestIdReportMarkdown', () => {
  it('renders a clean-bill-of-health message when there are no entries', () => {
    const markdown = renderMissingTestIdReportMarkdown({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-09-18T00:00:00Z',
      entries: [],
    });

    expect(markdown).toContain('0 element(s) with no test ID');
    expect(markdown).toContain('Every interactive element has a test ID candidate.');
  });

  it('groups entries by file under their own heading, in the given order', () => {
    const markdown = renderMissingTestIdReportMarkdown({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-09-18T00:00:00Z',
      entries: [
        {
          elementId: 'a',
          name: 'submit',
          kind: 'button',
          source: 'static',
          sourceLocation: { filePath: 'src/A.tsx', line: 5 },
        },
        {
          elementId: 'b',
          kind: 'input',
          source: 'static',
          sourceLocation: { filePath: 'src/A.tsx', line: 9 },
        },
        { elementId: 'c', kind: 'button', source: 'crawl' },
      ],
    });

    expect(markdown).toContain('## src/A.tsx');
    expect(markdown).toContain('- button `submit` (static) — line 5');
    expect(markdown).toContain('- input (static) — line 9');
    expect(markdown).toContain('## Unknown source');
    expect(markdown).toContain('- button (crawl)');
    expect(markdown.indexOf('## src/A.tsx')).toBeLessThan(markdown.indexOf('## Unknown source'));
  });
});
