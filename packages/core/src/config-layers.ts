// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@qa-ai-stlc/schemas';

export type ConfigLayerName = 'committed' | 'local';

/** The layer a leaf value of the merged configuration came from (ADR-011); arrays are one leaf. */
export interface ConfigValueSource {
  readonly path: readonly string[];
  readonly layer: ConfigLayerName;
}

/** An effective value less safe than the committed layer, which every CLI command reports. */
export type ConfigRelaxation =
  | {
      readonly kind: 'allowlist-entry';
      readonly environment: string;
      readonly hostname: string;
      readonly localLayerPath: string;
    }
  | { readonly kind: 'tls-insecure'; readonly environment: string; readonly localLayerPath: string };

export interface MergedConfigLayers {
  readonly merged: unknown;
  readonly sources: readonly ConfigValueSource[];
}

export type ConfigValueLayer = ConfigLayerName | 'default';

/** One leaf of the effective configuration and where it came from, for `qa config show --explain`. */
export interface ConfigShowValue {
  readonly path: readonly string[];
  readonly value: unknown;
  readonly layer: ConfigValueLayer;
}

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectLeafSources(
  value: unknown,
  path: readonly string[],
  layer: ConfigLayerName,
  sources: ConfigValueSource[],
): void {
  if (!isPlainObject(value)) {
    sources.push({ path, layer });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectLeafSources(child, [...path, key], layer, sources);
  }
}

function mergeNode(
  committed: unknown,
  local: unknown,
  path: readonly string[],
  sources: ConfigValueSource[],
): unknown {
  if (local === undefined) {
    collectLeafSources(committed, path, 'committed', sources);
    return committed;
  }
  if (!isPlainObject(committed) || !isPlainObject(local)) {
    collectLeafSources(local, path, 'local', sources);
    return local;
  }
  const merged: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(committed), ...Object.keys(local)])) {
    merged[key] = mergeNode(committed[key], local[key], [...path, key], sources);
  }
  return merged;
}

/**
 * Merges the local layer over the committed one (ADR-011): objects merge key by key, arrays and
 * scalars replace, and a key missing from the local layer keeps its committed value, so the local
 * layer can never delete one. Records the layer of every leaf for `qa config show --explain`.
 */
export function mergeConfigLayers(
  committed: unknown,
  local: Readonly<Record<string, unknown>> | undefined,
): MergedConfigLayers {
  const sources: ConfigValueSource[] = [];
  const merged = mergeNode(committed, local, [], sources);
  return { merged, sources };
}

function isPathPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index]);
}

/**
 * The layers a validation issue at `issuePath` can be blamed on: every leaf at or under the
 * deepest ancestor of `issuePath` that has any leaf, or that is a prefix of `issuePath`. An issue
 * about a value neither layer set (a missing required section, a cross-field rule) belongs to the
 * committed layer, which is where the schema expects it.
 */
export function findIssueLayers(
  issuePath: readonly string[],
  sources: readonly ConfigValueSource[],
): readonly ConfigLayerName[] {
  for (let length = issuePath.length; length > 0; length -= 1) {
    const ancestor = issuePath.slice(0, length);
    const layers = new Set(
      sources
        .filter((source) => isPathPrefix(ancestor, source.path) || isPathPrefix(source.path, ancestor))
        .map((source) => source.layer),
    );
    if (layers.size > 0) {
      return [...layers].sort();
    }
  }
  return ['committed'];
}

function readCommittedEnvironment(
  committed: unknown,
  name: string,
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainObject(committed) || !isPlainObject(committed.environments)) {
    return undefined;
  }
  const environment = committed.environments[name];
  return isPlainObject(environment) ? environment : undefined;
}

function pathsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function collectShowValues(
  value: unknown,
  path: readonly string[],
  sources: readonly ConfigValueSource[],
  values: ConfigShowValue[],
): void {
  if (!isPlainObject(value)) {
    const matched = sources.find((source) => pathsEqual(source.path, path));
    values.push({ path, value, layer: matched?.layer ?? 'default' });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectShowValues(child, [...path, key], sources, values);
  }
}

/**
 * Every leaf of the effective configuration, with the layer it came from: `committed` or `local`
 * when the raw layer set it, `default` when only `ConfigSchema`'s own default filled it in (for
 * example an omitted `schemaVersion` or `flaky`). Sorted by path for stable output (AGENTS.md 12.6).
 */
export function buildConfigShowValues(
  config: Config,
  sources: readonly ConfigValueSource[],
): readonly ConfigShowValue[] {
  const values: ConfigShowValue[] = [];
  collectShowValues(config, [], sources, values);
  return values.toSorted((a, b) => a.path.join('.').localeCompare(b.path.join('.')));
}

/**
 * Every effective value less safe than the committed layer (ADR-011): an allowlist entry the
 * committed layer does not list for that environment, and `tlsInsecure: true` it does not set.
 * Hostnames compare exactly, as the runtime allowlist check does (browser-allowlist.ts).
 */
export function findConfigRelaxations(
  committed: unknown,
  effective: Config,
  localLayerPath: string,
): readonly ConfigRelaxation[] {
  const relaxations: ConfigRelaxation[] = [];
  for (const [name, environment] of Object.entries(effective.environments)) {
    const committedEnvironment = readCommittedEnvironment(committed, name);
    const committedAllowlist = Array.isArray(committedEnvironment?.allowlist)
      ? committedEnvironment.allowlist
      : [];
    for (const hostname of environment.allowlist) {
      if (!committedAllowlist.includes(hostname)) {
        relaxations.push({ kind: 'allowlist-entry', environment: name, hostname, localLayerPath });
      }
    }
    if (environment.tlsInsecure === true && committedEnvironment?.tlsInsecure !== true) {
      relaxations.push({ kind: 'tls-insecure', environment: name, localLayerPath });
    }
  }
  return relaxations;
}
