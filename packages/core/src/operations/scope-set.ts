// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ScopeSchema, type RelativePath, type Scope } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';

const SCOPE_PATH: RelativePath = 'artifacts/scope.json';

export interface ScopeSetOptions {
  readonly requirementIds: readonly string[];
  readonly inScope: boolean;
}

export interface ScopeSetResult {
  readonly scopePath: string;
  /** How many requirements this call actually moved; one already where asked is left alone. */
  readonly changed: number;
  readonly inScopeCount: number;
  readonly outOfScopeCount: number;
}

/**
 * `qa scope set` / MCP `qa_scope_set`: takes requirements out of scope, or puts them back. The
 * decision is stored in `artifacts/scope.json` itself, so the scope gate's hash covers it and an
 * approval given before the change reopens. A call that changes nothing writes nothing, so it does
 * not reopen a gate for no reason. Every id must exist: a typo must not silently do nothing.
 */
export async function runScopeSet(context: EngineContext, options: ScopeSetOptions): Promise<ScopeSetResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifestStore = new ManifestStore({ store, clock: context.clock });
  const scope = await manifestStore.readVerified(SCOPE_PATH, ScopeSchema);
  if (scope === undefined) {
    throw new QaError('SCOPE_NOT_FOUND', 'There is no scope artifact to change yet', {
      remediation: 'Run "qa scope" to extract requirements first.',
    });
  }

  const knownIds = new Set(scope.requirements.map((requirement) => requirement.id));
  const unknown = options.requirementIds.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new QaError('SCOPE_REQUIREMENT_NOT_FOUND', `Not in artifacts/scope.json: ${unknown.join(', ')}`, {
      remediation: 'Use the ids "qa scope" reported; they are the slugs of the requirement headings.',
    });
  }

  const targetIds = new Set(options.requirementIds);
  const changedIds = scope.requirements
    .filter((requirement) => targetIds.has(requirement.id) && requirement.inScope !== options.inScope)
    .map((requirement) => requirement.id);

  if (changedIds.length === 0) {
    return summarize(scope, 0);
  }

  const moved = new Set(changedIds);
  const updated: Scope = {
    ...scope,
    generatedAt: context.clock.now().toISOString(),
    requirements: scope.requirements.map((requirement) =>
      moved.has(requirement.id) ? { ...requirement, inScope: options.inScope } : requirement,
    ),
  };
  const serialized = toCanonicalJson(updated);
  await store.writeText(SCOPE_PATH, serialized);
  await manifestStore.register(SCOPE_PATH, serialized);
  return summarize(updated, changedIds.length);
}

function summarize(scope: Scope, changed: number): ScopeSetResult {
  const inScopeCount = scope.requirements.filter((requirement) => requirement.inScope).length;
  return {
    scopePath: SCOPE_PATH,
    changed,
    inScopeCount,
    outOfScopeCount: scope.requirements.length - inScopeCount,
  };
}
