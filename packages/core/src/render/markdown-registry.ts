// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FeatureCaseIndex, RunRecord, TestCase } from '@qa-ai-stlc/schemas';
import type { A11yConformanceReport } from '../a11y-conformance.js';
import type { TraceabilityMatrix } from '../traceability.js';
import { renderA11yConformanceMarkdown } from './a11y-conformance-markdown.js';
import { renderCaseIndexMarkdown } from './case-index-markdown.js';
import { renderRunSummaryMarkdown } from './run-summary-markdown.js';
import { renderTestCaseMarkdown } from './test-case-markdown.js';
import { renderTraceabilityMatrixMarkdown } from './traceability-matrix-markdown.js';

/**
 * Every artifact kind with a registered Markdown renderer, and the artifact type each kind
 * renders. A later phase (DefectDraftSchema/RCA rendering, Phase 4+) adds its own kind here and to
 * `MARKDOWN_RENDERERS` below, without touching `test-case-markdown.ts` or any other kind's
 * renderer (ADR-002).
 */
export interface MarkdownArtifactByKind {
  'test-case': TestCase;
  'case-index': FeatureCaseIndex;
  'run-summary': RunRecord;
  'traceability-matrix': TraceabilityMatrix;
  'a11y-conformance': A11yConformanceReport;
}

export type ArtifactKind = keyof MarkdownArtifactByKind;

const MARKDOWN_RENDERERS: {
  readonly [Kind in ArtifactKind]: (artifact: MarkdownArtifactByKind[Kind]) => string;
} = {
  'test-case': renderTestCaseMarkdown,
  'case-index': renderCaseIndexMarkdown,
  'run-summary': renderRunSummaryMarkdown,
  'traceability-matrix': renderTraceabilityMatrixMarkdown,
  'a11y-conformance': renderA11yConformanceMarkdown,
};

/** Renders one registered artifact kind to Markdown through its own renderer. */
export function renderMarkdownArtifact<Kind extends ArtifactKind>(
  kind: Kind,
  artifact: MarkdownArtifactByKind[Kind],
): string {
  return MARKDOWN_RENDERERS[kind](artifact);
}
