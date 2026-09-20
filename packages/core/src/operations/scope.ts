// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  ScopeSchema,
  type RelativePath,
  type RequirementSource,
  type Scope,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { extractRequirements } from '../requirement-extraction.js';
import { mergeRequirements } from '../scope-merge.js';

const SCOPE_PATH: RelativePath = 'artifacts/scope.json';

export interface ScopeOptions {
  readonly from: string;
  readonly path?: string;
  readonly content?: string;
  readonly label?: string;
}

export interface ScopeResult {
  readonly scopePath: string;
  readonly added: number;
  readonly updated: number;
  readonly total: number;
}

/**
 * `qa scope` / MCP `qa_scope` (development plan section 2.4, 2.7 step 4; P2-05): deterministically
 * extracts requirements from a local source — the framework never fetches requirements from a
 * tracker (AGENTS.md 2.4) — and upserts them into `artifacts/scope.json` by id, so a repeated call
 * updates rather than duplicates. The scope gate itself (`qa approve scope`, P2-01) is a separate,
 * later step.
 */
export async function runScope(context: EngineContext, options: ScopeOptions): Promise<ScopeResult> {
  const { content, source } = await resolveSource(context, options);
  const incoming = extractRequirements(content, source);

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const existing = await loadScope(store, context);
  const merge = mergeRequirements(existing.requirements, incoming);

  const scope: Scope = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: context.clock.now().toISOString(),
    requirements: [...merge.requirements],
  };
  const serialized = JSON.stringify(scope);
  await store.writeJson(SCOPE_PATH, scope);
  await new ManifestStore({ store, clock: context.clock }).register(SCOPE_PATH, serialized);

  return {
    scopePath: SCOPE_PATH,
    added: merge.added,
    updated: merge.updated,
    total: scope.requirements.length,
  };
}

async function loadScope(store: QaStore, context: EngineContext): Promise<Scope> {
  const exists = await store.pathExists(SCOPE_PATH);
  if (!exists) {
    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: context.clock.now().toISOString(),
      requirements: [],
    };
  }
  return store.readJson(SCOPE_PATH, ScopeSchema);
}

async function resolveSource(
  context: EngineContext,
  options: ScopeOptions,
): Promise<{ content: string; source: RequirementSource }> {
  if (options.from === 'file') {
    return resolveFileSource(context, options);
  }
  if (options.from === 'text') {
    return resolveTextSource(options);
  }
  throw new QaError('SCOPE_FROM_INVALID', `"${options.from}" is not a valid --from value`, {
    remediation: 'Use one of: file, text.',
  });
}

async function resolveFileSource(
  context: EngineContext,
  options: ScopeOptions,
): Promise<{ content: string; source: RequirementSource }> {
  if (options.path === undefined) {
    throw new QaError('SCOPE_USAGE', 'Usage: qa scope --from file --path <path>', {
      remediation: 'Example: qa scope --from file --path docs/requirements.md',
    });
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  const exists = await context.fs.pathExists(absolutePath);
  if (!exists) {
    throw new QaError('SCOPE_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check the --path value points at a real, readable file relative to the project root.',
    });
  }
  const content = await context.fs.readFile(absolutePath);
  return { content, source: { kind: 'file', path } };
}

function resolveTextSource(options: ScopeOptions): { content: string; source: RequirementSource } {
  if (options.content === undefined || options.label === undefined) {
    throw new QaError('SCOPE_USAGE', 'Usage: qa scope --from text --content <text> --label <label>', {
      remediation: 'Example: qa scope --from text --content "## Item\\nbody" --label "operator input"',
    });
  }
  return { content: options.content, source: { kind: 'text', label: options.label } };
}
