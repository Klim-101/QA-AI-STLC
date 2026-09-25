// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FeatureCaseIndex, TestCase } from '@qa-ai-stlc/schemas';
import { renderCaseIndexMarkdown } from './case-index-markdown.js';
import { renderTestCaseMarkdown } from './test-case-markdown.js';

/**
 * Every artifact kind with a registered Markdown renderer, and the artifact type each kind
 * renders. A later phase (DefectDraftSchema/RCA rendering, Phase 4+) adds its own kind here and to
 * `MARKDOWN_RENDERERS` below, without touching `test-case-markdown.ts` or any other kind's
 * renderer (ADR-002).
 */
export interface MarkdownArtifactByKind {
  'test-case': TestCase;
  'case-index': FeatureCaseIndex;
}

export type ArtifactKind = keyof MarkdownArtifactByKind;

const MARKDOWN_RENDERERS: {
  readonly [Kind in ArtifactKind]: (artifact: MarkdownArtifactByKind[Kind]) => string;
} = {
  'test-case': renderTestCaseMarkdown,
  'case-index': renderCaseIndexMarkdown,
};

/** Renders one registered artifact kind to Markdown through its own renderer. */
export function renderMarkdownArtifact<Kind extends ArtifactKind>(
  kind: Kind,
  artifact: MarkdownArtifactByKind[Kind],
): string {
  return MARKDOWN_RENDERERS[kind](artifact);
}
