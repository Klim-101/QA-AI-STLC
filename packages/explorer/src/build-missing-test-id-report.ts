// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION } from '@qa-ai-stlc/schemas';
import type { MissingTestIdEntry, MissingTestIdReport, SelectorRegistry } from '@qa-ai-stlc/schemas';

function hasTestId(element: SelectorRegistry['elements'][number]): boolean {
  return element.locatorCandidates.some((candidate) => candidate.strategy === 'testId');
}

// `sourceLocation` is either present on both `a` and `b`'s underlying type or absent — it comes
// straight from `SelectorElement.sourceLocation` (selector-registry.ts), whose own two fields are
// both required together — so once both are known to be present, `a.sourceLocation.line` is never
// missing and needs no fallback.
function compareEntries(a: MissingTestIdEntry, b: MissingTestIdEntry): number {
  if (a.sourceLocation === undefined || b.sourceLocation === undefined) {
    if ((a.sourceLocation === undefined) !== (b.sourceLocation === undefined)) {
      return a.sourceLocation === undefined ? 1 : -1; // a known location sorts first
    }
    return a.elementId.localeCompare(b.elementId);
  }
  return (
    a.sourceLocation.filePath.localeCompare(b.sourceLocation.filePath) ||
    a.sourceLocation.line - b.sourceLocation.line ||
    a.elementId.localeCompare(b.elementId)
  );
}

/**
 * Lists every non-deprecated registry element with no `testId` locator candidate (development
 * plan section 6.3 step 9), with its source file and line when the registry knows one — only
 * `source: 'static'` entries (P1-12) ever do; `crawl`/`manual` entries report no `sourceLocation`
 * rather than guessing. Entries with a known location sort first, by file then line; the rest sort
 * by `elementId`, both orders deterministic across runs on an unchanged registry.
 */
export function buildMissingTestIdReport(registry: SelectorRegistry): MissingTestIdReport {
  const entries: MissingTestIdEntry[] = registry.elements
    .filter((element) => element.deprecatedAt === undefined && !hasTestId(element))
    .map((element) => ({
      elementId: element.elementId,
      ...(element.name === undefined ? {} : { name: element.name }),
      kind: element.kind,
      source: element.source,
      ...(element.sourceLocation === undefined ? {} : { sourceLocation: element.sourceLocation }),
    }))
    .sort(compareEntries);

  return { schemaVersion: SCHEMA_VERSION, generatedAt: registry.generatedAt, entries };
}

function entryLine(entry: MissingTestIdEntry): string {
  const label = entry.name === undefined ? entry.kind : `${entry.kind} \`${entry.name}\``;
  const location = entry.sourceLocation === undefined ? '' : ` — line ${String(entry.sourceLocation.line)}`;
  return `- ${label} (${entry.source})${location}`;
}

/**
 * Renders a `MissingTestIdReport` to Markdown (ADR-002: Markdown is rendered from JSON, never
 * hand-written) grouped by source file, with entries whose file is unknown collected under their
 * own heading rather than mixed in or silently dropped.
 */
export function renderMissingTestIdReportMarkdown(report: MissingTestIdReport): string {
  const count = report.entries.length;
  const header = `# Missing test ID report\n\n_Generated ${report.generatedAt} — ${String(count)} element(s) with no test ID._`;

  if (count === 0) {
    return `${header}\n\nEvery interactive element has a test ID candidate.\n`;
  }

  const sections: string[] = [];
  let currentFilePath: string | undefined;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentLines.length === 0) {
      return;
    }
    const heading = currentFilePath ?? 'Unknown source';
    sections.push(`## ${heading}\n\n${currentLines.join('\n')}`);
  };

  for (const entry of report.entries) {
    if (entry.sourceLocation?.filePath !== currentFilePath) {
      flush();
      currentFilePath = entry.sourceLocation?.filePath;
      currentLines = [];
    }
    currentLines.push(entryLine(entry));
  }
  flush();

  return `${header}\n\n${sections.join('\n\n')}\n`;
}
