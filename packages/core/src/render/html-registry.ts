// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunRecord } from '@qa-ai-stlc/schemas';
import type { TraceabilityMatrix } from '../traceability.js';
import { renderRunSummaryHtml } from './run-summary-html.js';
import { renderTraceabilityMatrixHtml } from './traceability-matrix-html.js';

/**
 * Every artifact kind with a registered HTML renderer, mirroring `markdown-registry.ts`'s
 * kind-by-artifact-type pattern (ADR-002). Starts with only the two kinds `qa report` (P3-08)
 * needs; a later renderer (e.g. `test-case`) gains an HTML kind here the same way, without
 * touching any other kind's renderer.
 */
export interface HtmlArtifactByKind {
  'run-summary': RunRecord;
  'traceability-matrix': TraceabilityMatrix;
}

export type HtmlArtifactKind = keyof HtmlArtifactByKind;

const HTML_RENDERERS: {
  readonly [Kind in HtmlArtifactKind]: (artifact: HtmlArtifactByKind[Kind]) => string;
} = {
  'run-summary': renderRunSummaryHtml,
  'traceability-matrix': renderTraceabilityMatrixHtml,
};

/** Renders one registered artifact kind to a standalone HTML document through its own renderer. */
export function renderHtmlArtifact<Kind extends HtmlArtifactKind>(
  kind: Kind,
  artifact: HtmlArtifactByKind[Kind],
): string {
  return HTML_RENDERERS[kind](artifact);
}
