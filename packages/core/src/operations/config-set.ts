// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { loadCommittedConfig } from '../config-loader.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import {
  ConfigSchema,
  TestingScopeDecisionSchema,
  UiComponentLibrarySchema,
  type TestingScope,
} from '@qa-ai-stlc/schemas';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { EngineContext } from '../engine-context.js';

export interface ConfigSetOptions {
  readonly key: string;
  readonly value: string;
}

export interface ConfigSetResult {
  readonly key: string;
  readonly value: string;
}

const TESTING_KEY = /^testing.(e2e|api|a11y|security)$/;
const UI_COMPONENT_LIBRARY_KEY = 'ui.componentLibrary';
const SUPPORTED_KEYS_HINT =
  'Use one of: testing.e2e, testing.api, testing.a11y, testing.security, ui.componentLibrary.';

interface ParsedSetting {
  readonly path: readonly [string, string];
  readonly value: string;
}

function parseTestingSetting(type: keyof TestingScope, rawValue: string): ParsedSetting {
  const decision = TestingScopeDecisionSchema.safeParse(rawValue);
  if (!decision.success) {
    throw new QaError('CONFIG_SET_VALUE_INVALID', `"${rawValue}" is not a valid testing scope decision`, {
      remediation: 'Use one of: in-scope, out-of-scope, undecided.',
    });
  }
  return { path: ['testing', type], value: decision.data };
}

function parseComponentLibrarySetting(rawValue: string): ParsedSetting {
  const library = UiComponentLibrarySchema.safeParse(rawValue);
  if (!library.success) {
    throw new QaError('CONFIG_SET_VALUE_INVALID', `"${rawValue}" is not a supported component library`, {
      remediation: `Use one of: ${UiComponentLibrarySchema.options.join(', ')}.`,
    });
  }
  return { path: ['ui', 'componentLibrary'], value: library.data };
}

function parseSetting(options: ConfigSetOptions): ParsedSetting {
  if (options.key === UI_COMPONENT_LIBRARY_KEY) {
    return parseComponentLibrarySetting(options.value);
  }
  const keyMatch = TESTING_KEY.exec(options.key);
  if (keyMatch === null) {
    throw new QaError('CONFIG_SET_KEY_UNSUPPORTED', `"${options.key}" is not a supported config key`, {
      remediation: SUPPORTED_KEYS_HINT,
    });
  }
  // The capturing group is not inside an alternation, so it always participates once the pattern
  // matches at all; the cast documents that instead of a defensive, untestable branch.
  return parseTestingSetting(keyMatch[1] as keyof TestingScope, options.value);
}

/**
 * `qa config set <key> <value>` (development plan section 2.7): changes one setting after
 * `qa init`'s survey. Supported keys are `testing.<type>` (`in-scope`, `out-of-scope` or
 * `undecided`) and `ui.componentLibrary`. Only changes and re-validates `config.yaml` itself; the
 * `cases` gate reopening a scope change can trigger (P2-16) is not this command's job —
 * `GateStateMachine` recomputes it, the same as an edited artifact's hash, the next time
 * `qa approve`/`qa validate` runs. Any other key is a coded error naming what is supported
 * instead of a silent no-op.
 * Preserves the rest of `config.yaml` — including comments and formatting — by editing the parsed
 * YAML document in place rather than re-rendering it from scratch.
 */
export async function runConfigSet(
  context: EngineContext,
  options: ConfigSetOptions,
): Promise<ConfigSetResult> {
  const setting = parseSetting(options);

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  // Throws a coded QaError (CONFIG_MISSING/CONFIG_MALFORMED/CONFIG_INVALID) if there is nothing
  // valid to edit yet, rather than this command producing its own, differently-worded one.
  await loadCommittedConfig(store);

  const raw = await store.readText('config.yaml');
  const document = parseDocument(raw);
  document.setIn([...setting.path], setting.value);

  const updated = ConfigSchema.safeParse(document.toJS());
  if (!updated.success) {
    throw new QaError(
      'CONFIG_SET_RESULT_INVALID',
      `Setting ${options.key} to "${setting.value}" would leave config.yaml invalid:
${z.prettifyError(updated.error)}`,
      { remediation: 'Fix the reported fields, or set a different value.', cause: updated.error },
    );
  }

  await store.writeText('config.yaml', document.toString());
  return { key: options.key, value: setting.value };
}
