// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from 'node:path';
import type { z } from 'zod';
import type { RelativePath } from '@qa-ai-stlc/schemas';
import { readJsonFile, writeJsonFile } from './json-file.js';
import { nodeFileSystem, type FileSystem } from './ports/file-system.js';
import { resolveRelativePath, toRelativePath } from './paths.js';

export interface QaStoreOptions {
  readonly projectRoot: string;
  readonly fs?: FileSystem;
}

// The footprint documented in the development plan section 3.2. `state.json` is owned by the
// state machine (P2-01) and `config.yaml` is written by `qa init` (P1-04); this store only
// guarantees the directories they land in exist.
const STORE_SUBDIRECTORIES = ['artifacts', 'selectors', 'runs', 'evidence', 'reports'] as const;

/**
 * The `.qa/` store: resolves an artifact's project-relative path to a real file under `.qa/`,
 * creates the documented directory layout, and reads or writes JSON through the injected
 * `FileSystem` port so callers never touch `node:fs` directly (AGENTS.md 5.3).
 */
export class QaStore {
  readonly projectRoot: string;
  readonly qaDir: string;
  private readonly fs: FileSystem;

  constructor(options: QaStoreOptions) {
    this.projectRoot = options.projectRoot;
    this.qaDir = join(options.projectRoot, '.qa');
    this.fs = options.fs ?? nodeFileSystem;
  }

  /** Resolves a project-relative artifact path (e.g. `manifest.json`) to an absolute path. */
  resolve(relativePath: RelativePath): string {
    return resolveRelativePath(this.qaDir, relativePath);
  }

  /** Converts an absolute path under `.qa/` back to the project-relative form artifacts use. */
  toRelativePath(absolutePath: string): RelativePath {
    return toRelativePath(this.qaDir, absolutePath);
  }

  async exists(): Promise<boolean> {
    return this.fs.pathExists(this.qaDir);
  }

  /** Creates `.qa/` and every committed subdirectory from the documented layout, if missing. */
  async ensureLayout(): Promise<void> {
    await this.fs.mkdir(this.qaDir);
    await Promise.all(STORE_SUBDIRECTORIES.map((name) => this.fs.mkdir(join(this.qaDir, name))));
  }

  async readJson<Schema extends z.ZodType>(
    relativePath: RelativePath,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    return readJsonFile(this.fs, this.resolve(relativePath), schema);
  }

  async writeJson(relativePath: RelativePath, value: unknown): Promise<void> {
    const absolutePath = this.resolve(relativePath);
    await this.fs.mkdir(dirname(absolutePath));
    await writeJsonFile(this.fs, absolutePath, value);
  }

  async pathExists(relativePath: RelativePath): Promise<boolean> {
    return this.fs.pathExists(this.resolve(relativePath));
  }

  async readText(relativePath: RelativePath): Promise<string> {
    return this.fs.readFile(this.resolve(relativePath));
  }

  /** Reads a file's raw bytes, with no encoding assumed (unlike `readText`'s UTF-8 decode). */
  async readBytes(relativePath: RelativePath): Promise<Uint8Array> {
    return this.fs.readBytes(this.resolve(relativePath));
  }

  async writeText(relativePath: RelativePath, content: string): Promise<void> {
    await this.writeBytes(relativePath, content);
  }

  /** Like `writeText`, but also accepts raw bytes for binary artifacts such as evidence. */
  async writeBytes(relativePath: RelativePath, content: string | Uint8Array): Promise<void> {
    const absolutePath = this.resolve(relativePath);
    await this.fs.mkdir(dirname(absolutePath));
    await this.fs.writeFile(absolutePath, content);
  }
}
