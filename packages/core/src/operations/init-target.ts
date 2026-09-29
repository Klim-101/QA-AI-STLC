// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { findEnclosingQaDirectory } from '../project-root.js';

export interface InitTarget {
  /** The absolute directory `qa.init` would create `.qa/` in. */
  readonly projectRoot: string;
}

/**
 * The project `qa.init` would create, or a refusal. `.qa/` in the target directory or any parent
 * means the operator is already inside an initialized project (or inside another project's tree):
 * creating a second `.qa/` there would either shadow that project's configuration or split one
 * project in two, so it is never done silently.
 */
export async function planProjectInit(context: EngineContext): Promise<InitTarget> {
  const projectRoot = resolve(context.projectRoot);
  const existing = await findEnclosingQaDirectory(context.fs, projectRoot);
  if (existing !== undefined) {
    throw new QaError('INIT_ALREADY_INITIALIZED', `A .qa/ directory already exists in ${existing}`, {
      remediation:
        existing === projectRoot
          ? 'This project is already initialized; change it with qa.config_set or qa.config_add.'
          : `${existing} is already a QA-AI-STLC project. Start the session from a directory outside it to initialize a separate project.`,
    });
  }
  return { projectRoot };
}
