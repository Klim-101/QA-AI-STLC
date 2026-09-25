// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { TestCaseSchema, type RelativePath } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import { renderMarkdownArtifact } from '../render/markdown-registry.js';

const CASES_DIR: RelativePath = 'artifacts/cases';

export interface CasesRenderOptions {
  readonly id?: string;
}

export interface CasesRenderResult {
  readonly casePath: RelativePath;
  readonly markdown: string;
}

/**
 * `qa cases render <id>` / MCP `qa.cases_render` (P2-25, ADR-002): finds the registered test case
 * with the given id under `artifacts/cases/**`, and renders it as a numbered Markdown document
 * through the shared artifact-renderer registry, so a case can be handed to a stakeholder as a
 * presentable document instead of raw JSON.
 */
export async function runCasesRender(
  context: EngineContext,
  options: CasesRenderOptions,
): Promise<CasesRenderResult> {
  if (options.id === undefined) {
    throw new QaError('CASES_RENDER_USAGE', 'Usage: qa cases render <id>', {
      remediation: 'Example: qa cases render login-invalid-credentials',
    });
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const casePath = await findCasePath(store, options.id);
  const testCase = await store.readJson(casePath, TestCaseSchema);
  const markdown = renderMarkdownArtifact('test-case', testCase);
  return { casePath, markdown };
}

/** Every case is registered under `artifacts/cases/<feature>/<id>.json`, feature unknown to the caller. */
export async function findCasePath(store: QaStore, id: string): Promise<RelativePath> {
  const caseFiles = await store.listFiles(CASES_DIR);
  const matches = caseFiles.filter((path) => path.endsWith(`/${id}.json`));

  const [match] = matches;
  if (match === undefined) {
    throw new QaError('CASE_NOT_FOUND', `No registered test case with id "${id}"`, {
      remediation: 'Check the id against the case files registered under artifacts/cases/**.',
    });
  }
  if (matches.length > 1) {
    throw new QaError(
      'CASE_ID_AMBIGUOUS',
      `Multiple registered test cases have id "${id}": ${matches.join(', ')}`,
      { remediation: 'Case ids must be unique; rename one of the conflicting cases.' },
    );
  }
  return match;
}
