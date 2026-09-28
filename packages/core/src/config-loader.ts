// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isAbsolute, join } from 'node:path';
import type { z } from 'zod';
import {
  ConfigSchema,
  isLocalOverridableConfigSection,
  type Config,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import { parse as parseYaml } from 'yaml';
import {
  findConfigRelaxations,
  findIssueLayers,
  isPlainObject,
  mergeConfigLayers,
  type ConfigLayerName,
  type ConfigRelaxation,
  type ConfigValueSource,
} from './config-layers.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import type { FileSystem } from './ports/file-system.js';
import { QaStore } from './qa-store.js';

const CONFIG_PATH: RelativePath = 'config.yaml';
const COMMITTED_LAYER_DISPLAY_PATH = '.qa/config.yaml';
const DEFAULT_LOCAL_LAYER_PATH: RelativePath = 'config.local.yaml';
const DEFAULT_LOCAL_LAYER_DISPLAY_PATH = '.qa/config.local.yaml';

/** What loading the layered configuration needs: a subset of `EngineContext`. */
export type ConfigSource = Pick<EngineContext, 'projectRoot' | 'fs' | 'env'>;

export interface LoadedConfig {
  readonly config: Config;
  /** The local layer file as the operator named it, or `undefined` when no local layer applied. */
  readonly localLayerPath: string | undefined;
  readonly sources: readonly ConfigValueSource[];
  readonly relaxations: readonly ConfigRelaxation[];
}

interface LocalLayerFile {
  readonly absolutePath: string;
  readonly displayPath: string;
}

function parseYamlFile(raw: string, displayPath: string): unknown {
  try {
    return parseYaml(raw);
  } catch (error) {
    throw new QaError('CONFIG_MALFORMED', `${displayPath} is not valid YAML`, {
      remediation: 'Fix the YAML syntax reported below and re-run.',
      cause: error,
    });
  }
}

async function readCommittedLayer(store: QaStore): Promise<unknown> {
  if (!(await store.pathExists(CONFIG_PATH))) {
    throw new QaError('CONFIG_MISSING', 'No .qa/config.yaml found', {
      remediation: 'Run "qa init" to create the .qa/ store and its configuration file.',
    });
  }
  return parseYamlFile(await store.readText(CONFIG_PATH), COMMITTED_LAYER_DISPLAY_PATH);
}

/**
 * The local layer to read (ADR-011): the file `QA_CONFIG_LOCAL` names, which must exist because an
 * explicit selection that silently loads nothing would hide a broken CI setup, or else
 * `.qa/config.local.yaml` when present. An empty `QA_CONFIG_LOCAL` counts as unset.
 */
async function findLocalLayerFile(source: ConfigSource, store: QaStore): Promise<LocalLayerFile | undefined> {
  const selected = source.env.QA_CONFIG_LOCAL;
  if (selected !== undefined && selected !== '') {
    const absolutePath = isAbsolute(selected) ? selected : join(source.projectRoot, selected);
    if (!(await source.fs.pathExists(absolutePath))) {
      throw new QaError('CONFIG_LOCAL_MISSING', `QA_CONFIG_LOCAL names "${selected}", which does not exist`, {
        remediation:
          'Create that file, fix the path (absolute, or relative to the project root), or unset QA_CONFIG_LOCAL.',
      });
    }
    return { absolutePath, displayPath: selected };
  }
  const absolutePath = store.resolve(DEFAULT_LOCAL_LAYER_PATH);
  if (!(await source.fs.pathExists(absolutePath))) {
    return undefined;
  }
  return { absolutePath, displayPath: DEFAULT_LOCAL_LAYER_DISPLAY_PATH };
}

async function readLocalLayer(
  fs: FileSystem,
  file: LocalLayerFile,
): Promise<Readonly<Record<string, unknown>>> {
  const parsed = parseYamlFile(await fs.readFile(file.absolutePath), file.displayPath);
  // An empty file parses to null: a local layer that overrides nothing.
  if (parsed === null) {
    return {};
  }
  if (!isPlainObject(parsed)) {
    throw new QaError(
      'CONFIG_MALFORMED',
      `${file.displayPath} must be a YAML mapping of configuration sections`,
      {
        remediation: 'Write the local overrides as top-level keys, for example "environments:".',
      },
    );
  }
  for (const key of Object.keys(parsed)) {
    if (!isLocalOverridableConfigSection(key)) {
      throw new QaError(
        'CONFIG_OVERRIDE_NOT_ALLOWED',
        `${file.displayPath} sets "${key}", which only .qa/config.yaml may set`,
        {
          remediation:
            'A local layer may set only environments, identities, source and agents. Move the value to .qa/config.yaml, or remove it.',
        },
      );
    }
  }
  return parsed;
}

function describeLayers(layers: readonly ConfigLayerName[], localDisplayPath: string): string {
  return layers
    .map((layer) => (layer === 'committed' ? COMMITTED_LAYER_DISPLAY_PATH : localDisplayPath))
    .join(' and ');
}

// Without a local layer every value comes from .qa/config.yaml, so naming it on each issue is noise.
function formatIssues(
  error: z.ZodError,
  sources: readonly ConfigValueSource[],
  localDisplayPath: string | undefined,
): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String);
      const location = path.length > 0 ? path.join('.') : '(root)';
      const origin =
        localDisplayPath === undefined
          ? ''
          : ` (from ${describeLayers(findIssueLayers(path, sources), localDisplayPath)})`;
      return `  ✖ ${location}: ${issue.message}${origin}`;
    })
    .join('\n');
}

function validateEffectiveConfig(
  merged: unknown,
  sources: readonly ConfigValueSource[],
  localDisplayPath: string | undefined,
): Config {
  const result = ConfigSchema.safeParse(merged);
  if (result.success) {
    return result.data;
  }
  const subject =
    localDisplayPath === undefined
      ? '.qa/config.yaml'
      : `The configuration merged from .qa/config.yaml and ${localDisplayPath}`;
  const issues = formatIssues(result.error, sources, localDisplayPath);
  throw new QaError('CONFIG_INVALID', `${subject} does not match its schema:\n${issues}`, {
    remediation: 'Fix the reported fields in the named file, or regenerate .qa/config.yaml with "qa init".',
    cause: result.error,
  });
}

/**
 * Builds the effective configuration from `.qa/config.yaml` plus the optional local layer
 * (ADR-011), validated as a whole against `ConfigSchema`. Also returns the source layer of every
 * leaf value and every relaxation, so callers can show where a value came from and report any
 * widened allowlist or disabled TLS validation. Throws `QaError`: `CONFIG_MISSING`,
 * `CONFIG_MALFORMED`, `CONFIG_INVALID`, `CONFIG_LOCAL_MISSING`, `CONFIG_OVERRIDE_NOT_ALLOWED`.
 */
export async function loadLayeredConfig(source: ConfigSource): Promise<LoadedConfig> {
  const store = new QaStore({ projectRoot: source.projectRoot, fs: source.fs });
  const committed = await readCommittedLayer(store);
  const localFile = await findLocalLayerFile(source, store);
  const local = localFile === undefined ? undefined : await readLocalLayer(source.fs, localFile);
  const { merged, sources } = mergeConfigLayers(committed, local);
  const config = validateEffectiveConfig(merged, sources, localFile?.displayPath);
  return {
    config,
    localLayerPath: localFile?.displayPath,
    sources,
    relaxations:
      localFile === undefined ? [] : findConfigRelaxations(committed, config, localFile.displayPath),
  };
}

/** The effective configuration (see `loadLayeredConfig`), for callers that need only the values. */
export async function loadConfig(source: ConfigSource): Promise<Config> {
  const { config } = await loadLayeredConfig(source);
  return config;
}

/**
 * Validates `.qa/config.yaml` alone, ignoring the local layer: for commands that edit the
 * committed file, whose result every machine shares.
 */
export async function loadCommittedConfig(store: QaStore): Promise<Config> {
  const committed = await readCommittedLayer(store);
  const { merged, sources } = mergeConfigLayers(committed, undefined);
  return validateEffectiveConfig(merged, sources, undefined);
}
