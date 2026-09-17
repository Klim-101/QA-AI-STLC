// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaStore } from '@qa-ai-stlc/core';
import type { CommandContext } from '../command-context.js';
import { CONFIG_TEMPLATE, QA_GITIGNORE } from '../config-template.js';

export interface InitOptions {
  readonly force?: boolean;
}

export interface InitResult {
  readonly qaDir: string;
  readonly created: readonly string[];
  readonly alreadyInitialized: boolean;
}

/**
 * `qa init`: creates the documented `.qa/` layout (development plan section 3.2), a starting
 * `config.yaml` with every testing type `undecided`, and a `.gitignore` for the runtime-only
 * subdirectories. Never overwrites an existing `config.yaml` unless `force` is set, so a second
 * run is safe.
 */
export async function runInit(context: CommandContext, options: InitOptions = {}): Promise<InitResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const configExisted = await store.pathExists('config.yaml');
  await store.ensureLayout();

  const created: string[] = [];
  if (!configExisted || options.force === true) {
    await store.writeText('config.yaml', CONFIG_TEMPLATE);
    created.push('config.yaml');
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
