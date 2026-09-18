// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, QaStore } from '@qa-ai-stlc/core';
import type { TestingScope, TestingScopeDecision } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';
import { QA_GITIGNORE, renderConfigYaml } from '../config-template.js';

export interface TestingScopeAnswers {
  readonly e2e?: TestingScopeDecision;
  readonly api?: TestingScopeDecision;
  readonly a11y?: TestingScopeDecision;
  readonly security?: TestingScopeDecision;
}

export interface InitOptions {
  readonly force?: boolean;
  /** Skips the "every type answered" gate below, leaving an unanswered type `undecided`. */
  readonly deferScope?: boolean;
  readonly testing?: TestingScopeAnswers;
  readonly sourcePath?: string;
  readonly apiSource?: string;
}

export interface InitResult {
  readonly qaDir: string;
  readonly created: readonly string[];
  readonly alreadyInitialized: boolean;
}

function resolveTestingScope(answers: TestingScopeAnswers, deferScope: boolean): TestingScope {
  const testing: TestingScope = {
    e2e: answers.e2e ?? 'undecided',
    api: answers.api ?? 'undecided',
    a11y: answers.a11y ?? 'undecided',
    security: answers.security ?? 'undecided',
  };

  if (deferScope) {
    return testing;
  }
  const undecidedTypes = (Object.keys(testing) as (keyof TestingScope)[]).filter(
    (type) => testing[type] === 'undecided',
  );
  if (undecidedTypes.length > 0) {
    throw new QaError(
      'INIT_SCOPE_UNDECIDED',
      `Testing scope left undecided for: ${undecidedTypes.join(', ')}`,
      {
        remediation:
          'Answer --e2e, --api, --a11y and --security (each "in-scope" or "out-of-scope"), or pass --defer-scope to leave them undecided for now.',
      },
    );
  }
  return testing;
}

/**
 * `qa init`: creates the documented `.qa/` layout (development plan section 3.2), then runs the
 * testing scope survey (section 2.7, P1-18) — Web E2E, API, accessibility and security are
 * answered independently and written to `config.yaml`'s `testing` block. A type left `undecided`
 * blocks `qa init` from finishing unless `deferScope` is set, so a project never silently starts
 * with a scope nobody actually decided. Never overwrites an existing `config.yaml` unless `force`
 * is set, so a second run is safe; the scope gate only applies when a `config.yaml` is actually
 * about to be written.
 */
export async function runInit(context: CommandContext, options: InitOptions = {}): Promise<InitResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const configExisted = await store.pathExists('config.yaml');
  const willWriteConfig = !configExisted || options.force === true;

  const created: string[] = [];
  if (willWriteConfig) {
    const testing = resolveTestingScope(options.testing ?? {}, options.deferScope === true);
    if (testing.api === 'in-scope' && options.apiSource === undefined) {
      throw new QaError(
        'INIT_API_SOURCE_MISSING',
        '"api" testing is in-scope but no --api-source was given',
        {
          remediation: 'Pass --api-source <file, URL, "discover" or "synthesize">.',
        },
      );
    }

    // `testing` is already a valid TestingScope, `api` was already checked above against
    // ConfigSchema's one refine (api required when testing.api is in-scope), and sourcePath/
    // apiSource are safely quoted by renderConfigYaml — nothing left that could make the
    // rendered file fail ConfigSchema, so there is no further validation step here.
    const configYaml = renderConfigYaml({
      testing,
      ...(options.sourcePath !== undefined ? { sourcePath: options.sourcePath } : {}),
      ...(options.apiSource !== undefined ? { apiSource: options.apiSource } : {}),
    });

    await store.ensureLayout();
    await store.writeText('config.yaml', configYaml);
    created.push('config.yaml');
  } else {
    await store.ensureLayout();
  }

  const gitignoreExisted = await store.pathExists('.gitignore');
  if (!gitignoreExisted || options.force === true) {
    await store.writeText('.gitignore', QA_GITIGNORE);
    created.push('.gitignore');
  }

  return {
    qaDir: store.qaDir,
    created,
    alreadyInitialized: configExisted && options.force !== true,
  };
}
