// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';
import { ManifestSchema, SCHEMA_VERSION, type Manifest, type RelativePath } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import { hashContent } from './hash.js';
import { systemClock, type Clock } from './ports/clock.js';
import type { QaStore } from './qa-store.js';

const MANIFEST_PATH: RelativePath = 'manifest.json';

export interface ManifestStoreOptions {
  readonly store: QaStore;
  readonly clock?: Clock;
}

/**
 * `.qa/manifest.json`: the hash of every artifact the engine has registered. `qa validate` and
 * every MCP mutation reject a file that is unregistered or whose content no longer matches its
 * recorded hash, so a direct filesystem write cannot pass for an engine-produced artifact
 * (AGENTS.md 2.5, ADR-003).
 */
export class ManifestStore {
  private readonly store: QaStore;
  private readonly clock: Clock;

  constructor(options: ManifestStoreOptions) {
    this.store = options.store;
    this.clock = options.clock ?? systemClock;
  }

  async load(): Promise<Manifest> {
    const exists = await this.store.pathExists(MANIFEST_PATH);
    if (!exists) {
      return { schemaVersion: SCHEMA_VERSION, artifacts: {} };
    }
    return this.store.readJson(MANIFEST_PATH, ManifestSchema);
  }

  async save(manifest: Manifest): Promise<void> {
    await this.store.writeJson(MANIFEST_PATH, manifest);
  }

  /** Hashes `content` and records it as the current registered version of `relativePath`. */
  async register(relativePath: RelativePath, content: string | Uint8Array): Promise<void> {
    const manifest = await this.load();
    const nextManifest: Manifest = {
      ...manifest,
      artifacts: {
        ...manifest.artifacts,
        [relativePath]: { sha256: hashContent(content), registeredAt: this.clock.now().toISOString() },
      },
    };
    await this.save(nextManifest);
  }

  /** Reports whether `content` still matches the hash registered for `relativePath`, if any. */
  async verify(relativePath: RelativePath, content: string | Uint8Array): Promise<boolean> {
    const manifest = await this.load();
    const entry = manifest.artifacts[relativePath];
    return entry?.sha256 === hashContent(content);
  }

  /** Throws a coded `QaError` when `relativePath` is unregistered or its content was tampered with. */
  async assertRegistered(relativePath: RelativePath, content: string | Uint8Array): Promise<void> {
    const manifest = await this.load();
    const entry = manifest.artifacts[relativePath];
    if (entry === undefined) {
      throw new QaError('ARTIFACT_UNREGISTERED', `"${relativePath}" is not registered in the manifest`, {
        remediation: 'Register the artifact through the engine before referencing it.',
      });
    }
    if (entry.sha256 !== hashContent(content)) {
      throw new QaError('ARTIFACT_HASH_MISMATCH', `"${relativePath}" does not match its registered hash`, {
        remediation: 'The file changed outside the engine; regenerate or re-register it through the engine.',
      });
    }
  }

  /**
   * Reads and schema-validates `relativePath` only after confirming its content matches the
   * manifest, so a mutation that loads an existing artifact before writing a new version can
   * never build on a hand-edited file. Returns `undefined` when the artifact does not exist yet,
   * distinct from `assertRegistered`'s throw for a path that exists but was never registered.
   */
  async readVerified<Schema extends z.ZodType>(
    relativePath: RelativePath,
    schema: Schema,
  ): Promise<z.infer<Schema> | undefined> {
    const exists = await this.store.pathExists(relativePath);
    if (!exists) {
      return undefined;
    }
    const content = await this.store.readText(relativePath);
    await this.assertRegistered(relativePath, content);
    return this.store.readJson(relativePath, schema);
  }
}
