// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rca, RcaHypothesis } from '@qa-ai-stlc/schemas';

/**
 * Renders an `RcaSchema` artifact as Markdown (ADR-002) that keeps what was established apart from
 * what is only suspected: facts first, then each hypothesis with its confidence and the evidence
 * that would confirm it. The `rca` renderer registered in `markdown-registry.ts`.
 */
export function renderRcaMarkdown(rca: Rca): string {
  const sections: string[] = [
    `# Root cause analysis: ${rca.defectId}`,
    [`**Defect:** ${rca.defectId}`, `**Status:** ${rca.status}`].join('\n'),
  ];

  sections.push(
    [
      '## Facts',
      '',
      rca.facts.length === 0 ? 'No confirmed facts recorded.' : renderBulletList(rca.facts),
    ].join('\n'),
  );
  sections.push(
    [
      '## Hypotheses',
      '',
      ...rca.hypotheses.map((hypothesis, index) => renderHypothesis(hypothesis, index)),
    ].join('\n'),
  );

  if (rca.remediation.length > 0) {
    sections.push(['## Remediation', '', renderBulletList(rca.remediation)].join('\n'));
  }
  if (rca.regressionRecommendation !== undefined) {
    sections.push(['## Regression recommendation', '', rca.regressionRecommendation].join('\n'));
  }

  return `${sections.join('\n\n')}\n`;
}

function renderHypothesis(hypothesis: RcaHypothesis, index: number): string {
  const lines = [`${String(index + 1)}. ${hypothesis.description} (confidence: ${hypothesis.confidence})`];
  if (hypothesis.evidenceNeeded !== undefined) {
    lines.push(`   - Evidence needed to confirm: ${hypothesis.evidenceNeeded}`);
  }
  return lines.join('\n');
}

function renderBulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}
