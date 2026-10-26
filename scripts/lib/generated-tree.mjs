// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// File-tree helpers shared by the adapter generators (`generate-*-plugin.mjs`): build the expected
// tree in memory, then either write it or compare it against what is on disk.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { format, resolveConfig } from 'prettier';

/** Every file under `dir`, as paths relative to `dir` using `/`, sorted for deterministic output. */
export function listFilesRecursive(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(absolute).map((path) => join(entry.name, path)));
    } else if (entry.isFile()) {
      results.push(entry.name);
    }
  }
  return results.map((path) => path.replaceAll('\\', '/')).sort();
}

/** Copies every file under `sourceDir` to `outRelativeDir` in the generated tree, verbatim. */
export function copyDirectory(sourceDir, outRelativeDir, files) {
  for (const relativePath of listFilesRecursive(sourceDir)) {
    files.set(join(outRelativeDir, relativePath).replaceAll('\\', '/'), {
      content: readFileSync(join(sourceDir, relativePath), 'utf8'),
    });
  }
}

export async function renderJson(value, outPath) {
  const config = await resolveConfig(outPath);
  return format(JSON.stringify(value), { ...config, filepath: outPath });
}

/** Reads a text file with LF endings so a Windows checkout (autocrlf) generates the same bytes as CI. */
export function readLfText(path) {
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
}

export function readExisting(absolutePath) {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function existingRelativePaths(dir) {
  try {
    if (!statSync(dir).isDirectory()) {
      return [];
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return listFilesRecursive(dir);
}

/**
 * Replaces `outDir` with `files` (a map of tree-relative path to `{ content }`) and writes each
 * `extraFiles` entry (absolute path to content) outside it.
 */
export function writeTree({ repoRoot, outDir, files, extraFiles }) {
  rmSync(outDir, { recursive: true, force: true });
  for (const [relativePath, { content }] of files) {
    const absolutePath = join(outDir, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  for (const [absolutePath, content] of extraFiles) {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  console.log(
    `Generated ${files.size} file(s) in ${relative(repoRoot, outDir)} and ${[...extraFiles.keys()]
      .map((path) => relative(repoRoot, path))
      .join(', ')}.`,
  );
}

/** Prints every mismatch between `files`/`extraFiles` and the disk; returns whether any was found. */
export function checkTree({ repoRoot, outDir, files, extraFiles }) {
  let outOfDate = false;
  for (const [relativePath, { content }] of files) {
    const absolutePath = join(outDir, relativePath);
    if (readExisting(absolutePath) !== content) {
      console.error(`${relative(repoRoot, absolutePath)} does not match its source. Run "npm run generate".`);
      outOfDate = true;
    }
  }
  for (const [absolutePath, content] of extraFiles) {
    if (readExisting(absolutePath) !== content) {
      console.error(`${relative(repoRoot, absolutePath)} does not match its source. Run "npm run generate".`);
      outOfDate = true;
    }
  }
  const expectedPaths = new Set(files.keys());
  for (const relativePath of existingRelativePaths(outDir)) {
    if (!expectedPaths.has(relativePath)) {
      console.error(
        `${join(relative(repoRoot, outDir), relativePath)} is not generated from any known source.`,
      );
      outOfDate = true;
    }
  }
  return outOfDate;
}
