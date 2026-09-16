// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Enforces ADR-001 (no model calls in the engine): no package.json in this repository may declare
// a dependency on an LLM SDK. All reasoning happens in the user's own agent host.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DENYLIST_EXACT_NAMES = new Set(['openai', 'ai', 'langchain']);
const DENYLIST_NAME_PREFIXES = [
  '@anthropic-ai/',
  '@google/genai',
  '@google-cloud/vertexai',
  '@azure/openai',
  '@langchain/',
];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage', 'adapters']);

function isDeniedPackageName(name) {
  if (DENYLIST_EXACT_NAMES.has(name)) {
    return true;
  }
  return DENYLIST_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function findManifestPaths(directory) {
  const manifestPaths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        manifestPaths.push(...findManifestPaths(join(directory, entry.name)));
      }
      continue;
    }
    if (entry.name === 'package.json') {
      manifestPaths.push(join(directory, entry.name));
    }
  }
  return manifestPaths;
}

function main() {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  let hasViolation = false;

  for (const manifestPath of findManifestPaths(repoRoot)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const relativePath = relative(repoRoot, manifestPath);
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (isDeniedPackageName(name)) {
          console.error(
            `${relativePath}: "${name}" in ${field} is an LLM SDK dependency, forbidden by ADR-001.`,
          );
          hasViolation = true;
        }
      }
    }
  }

  if (hasViolation) {
    process.exit(1);
  }
  console.log('No LLM SDK dependencies found.');
}

main();
