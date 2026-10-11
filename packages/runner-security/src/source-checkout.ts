// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { posix } from 'node:path';
import {
  assertRelativePath,
  resolveRelativePath,
  toRelativePath,
  type FileSystem,
  type ProcessRunner,
} from '@qa-ai-stlc/core';
import type { RelativePath } from '@qa-ai-stlc/schemas';

export interface SourceFile {
  /** Project-relative, with `/` separators, so a finding can cite it as it stands. */
  readonly path: RelativePath;
  readonly text: string;
}

export interface SourceScan {
  readonly files: readonly SourceFile[];
  /** True when the file limit stopped the scan, so a clean result does not cover the whole checkout. */
  readonly isTruncated: boolean;
  /** Files left out because they are binary or larger than the size limit. */
  readonly skippedCount: number;
}

export interface SourceCheckoutOptions {
  readonly projectRoot: string;
  /** The configured `source.path`; `.` and `./app` forms are accepted. */
  readonly relativeRoot: string;
  readonly fs: FileSystem;
  readonly processRunner: ProcessRunner;
  readonly maxFiles?: number;
  readonly maxFileSizeBytes?: number;
}

export const DEFAULT_MAX_SOURCE_FILES = 3000;
export const DEFAULT_MAX_SOURCE_FILE_SIZE_BYTES = 256 * 1024;

// Directories that hold installed or generated code rather than what the team wrote. Their content
// is somebody else's (or a copy of it), and walking them would bury the checkout's own files.
const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.qa',
  '.venv',
  '__pycache__',
  'vendor',
  'target',
]);

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.jar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp3',
  '.mp4',
  '.mov',
  '.exe',
  '.dll',
  '.so',
  '.map',
]);

// A NUL byte near the start is the usual sign of a file that is not text.
const BINARY_SNIFF_BYTES = 1024;

/**
 * A read-only view of the application's source checkout (`source.path`). It exposes no write, so a
 * code-assisted check cannot change the code it audits (AGENTS.md 12.4). The scan is bounded by a
 * file count and a file size and says when it was cut short, so a clean result is never mistaken
 * for a complete one.
 */
export class SourceCheckout {
  /** Project-relative with `/` separators; `''` when the checkout is the project root itself. */
  readonly relativeRoot: string;
  readonly processRunner: ProcessRunner;
  private readonly projectRoot: string;
  private readonly fs: FileSystem;
  private readonly maxFiles: number;
  private readonly maxFileSizeBytes: number;

  constructor(options: SourceCheckoutOptions) {
    const normalizedRoot = posix.normalize(options.relativeRoot).replace(/\/$/u, '');
    this.relativeRoot = normalizedRoot === '.' ? '' : normalizedRoot;
    this.processRunner = options.processRunner;
    this.projectRoot = options.projectRoot;
    this.fs = options.fs;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_SOURCE_FILES;
    this.maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_SOURCE_FILE_SIZE_BYTES;
  }

  /** The text files of the checkout in a stable order, without installed or generated directories. */
  async scan(): Promise<SourceScan> {
    const root = this.absoluteDirectory(this.relativeRoot);
    const candidates = (await this.fs.listFiles(root))
      .map((absolutePath) => toRelativePath(this.projectRoot, absolutePath))
      .filter((path) => this.isInsideRoot(path) && !this.isInIgnoredDirectory(path))
      .sort();
    const isTruncated = candidates.length > this.maxFiles;
    const files: SourceFile[] = [];
    let skippedCount = 0;
    for (const path of candidates.slice(0, this.maxFiles)) {
      const text = await this.readText(path);
      if (text === undefined) {
        skippedCount += 1;
        continue;
      }
      files.push({ path, text });
    }
    return { files, isTruncated, skippedCount };
  }

  /** One file's text, or `undefined` when it is missing, binary or over the size limit. */
  async readText(path: RelativePath): Promise<string | undefined> {
    const absolutePath = resolveRelativePath(this.projectRoot, path);
    if (
      BINARY_EXTENSIONS.has(posix.extname(path).toLowerCase()) ||
      !(await this.fs.pathExists(absolutePath))
    ) {
      return undefined;
    }
    const bytes = await this.fs.readBytes(absolutePath);
    if (bytes.length > this.maxFileSizeBytes || bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
      return undefined;
    }
    return Buffer.from(bytes).toString('utf-8');
  }

  /**
   * The nearest directory, from the checkout's root up to the project root, that holds `fileName`:
   * project-relative, `''` for the project root itself. A monorepo keeps one lockfile above the
   * packages it covers.
   */
  async findDirectoryWith(fileName: string): Promise<string | undefined> {
    let directory: string = this.relativeRoot;
    for (;;) {
      const candidate = directory === '' ? fileName : posix.join(directory, fileName);
      if (await this.fs.pathExists(resolveRelativePath(this.projectRoot, assertRelativePath(candidate)))) {
        return directory;
      }
      if (directory === '') {
        return undefined;
      }
      const parent = posix.dirname(directory);
      directory = parent === '.' ? '' : parent;
    }
  }

  /** The absolute, OS-native path of a project-relative directory (`''` is the project root). */
  absoluteDirectory(relativeDirectory: string): string {
    return relativeDirectory === ''
      ? this.projectRoot
      : resolveRelativePath(this.projectRoot, assertRelativePath(relativeDirectory));
  }

  private isInsideRoot(path: string): boolean {
    return this.relativeRoot === '' || path.startsWith(`${this.relativeRoot}/`);
  }

  private isInIgnoredDirectory(path: string): boolean {
    const relativeToRoot = (this.relativeRoot === '' ? path : path.slice(this.relativeRoot.length + 1)).split(
      '/',
    );
    return relativeToRoot.slice(0, -1).some((segment) => IGNORED_DIRECTORIES.has(segment));
  }
}
