// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, QaStore, loadConfig } from '@qa-ai-stlc/core';
import { ConfigSchema, TestingScopeDecisionSchema, type TestingScope } from '@qa-ai-stlc/schemas';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { CommandContext } from '../command-context.js';

export interface ConfigSetOptions {
  readonly key: string;
  readonly value: string;
}

export interface ConfigSetResult {
  readonly key: string;
  readonly value: string;
}

const TESTING_KEY = /^testing\.(e2e|api|a11y|security)$/;

/**
 * `qa config set testing.<type> <in-scope|out-of-scope|undecided>` (development plan section
 * 2.7): changes one testing type's scope decision after `qa init`'s survey. Reopening the gates
 * that decision affects is left to the state machine (P2-01), which does not exist yet; this
 * command only changes and re-validates `config.yaml`. Only `testing.<type>` keys are supported
 * today; anything else is a coded error naming what is supported instead of a silent no-op.
 * Preserves the rest of `config.yaml` — including comments and formatting — by editing the parsed
 * YAML document in place rather than re-rendering it from scratch.
 */
export async function runConfigSet(
  context: CommandContext,
  options: ConfigSetOptions,
): Promise<ConfigSetResult> {
  const keyMatch = TESTING_KEY.exec(options.key);
  if (keyMatch === null) {
    throw new QaError('CONFIG_SET_KEY_UNSUPPORTED', `"${options.key}" is not a supported config key`, {
      remediation: 'Use one of: testing.e2e, testing.api, testing.a11y, testing.security.',
    });
  }
  // The capturing group is not inside an alternation, so it always participates once the pattern
  // matches at all; the cast documents that instead of a defensive, untestable branch.
  const type = keyMatch[1] as keyof TestingScope;

  const decision = TestingScopeDecisionSchema.safeParse(options.value);
  if (!decision.success) {
    throw new QaError(
      'CONFIG_SET_VALUE_INVALID',
      `"${options.value}" is not a valid testing scope decision`,
      {
        remediation: 'Use one of: in-scope, out-of-scope, undecided.',
      },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  // Throws a coded QaError (CONFIG_MISSING/CONFIG_MALFORMED/CONFIG_INVALID) if there is nothing
  // valid to edit yet, rather than this command producing its own, differently-worded one.
  await loadConfig(store);

  const raw = await store.readText('config.yaml');
  const document = parseDocument(raw);
  document.setIn(['testing', type], decision.data);

  const updated = ConfigSchema.safeParse(document.toJS());
  if (!updated.success) {
    throw new QaError(
      'CONFIG_SET_RESULT_INVALID',
      `Setting testing.${type} to "${decision.data}" would leave config.yaml invalid:\n${z.prettifyError(updated.error)}`,
      { remediation: 'Fix the reported fields, or set a different value.', cause: updated.error },
    );
  }

  await store.writeText('config.yaml', document.toString());
  return { key: options.key, value: decision.data };
}
