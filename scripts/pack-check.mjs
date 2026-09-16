// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Guards distribution hygiene (AGENTS.md 11): every publishable package must declare an explicit
// `files` allowlist, and the tarball it would actually publish must never contain repository-only
// material such as AGENTS.md or docs/. `npm pack --dry-run` is the only way to see the exact file
// list npm would ship, including files added outside `files` (README.md, LICENSE, package.json).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_BASENAMES = new Set(['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md']);
const FORBIDDEN_PREFIXES = ['.github/', 'docs/', 'test/', 'tests/', '.qa/', 'examples/'];

function isForbidden(packedPath) {
  const basename = packedPath.split('/').pop();
  if (basename !== undefined && FORBIDDEN_BASENAMES.has(basename)) return true;
  return FORBIDDEN_PREFIXES.some((prefix) => packedPath.startsWith(prefix));
}

export function checkTarballEntries(entries) {
  return entries.filter(isForbidden);
}

function findPublishablePackages(packagesDir) {
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .filter((dir) => {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return manifest.private !== true;
    });
}

function packDryRun(packageDir, npmExecPath) {
  const output = execFileSync(
    process.execPath,
    [npmExecPath, 'pack', '--dry-run', '--json', '--foreground-scripts=false'],
    { cwd: packageDir, encoding: 'utf8' },
  );
  const [result] = JSON.parse(output);
  return result.files.map((file) => file.path);
}

function main() {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    console.error('pack-check.mjs must be invoked through an npm script (npm_execpath is unset).');
    process.exit(1);
  }

  const packagesDir = fileURLToPath(new URL('../packages/', import.meta.url));
  const packages = findPublishablePackages(packagesDir);
  if (packages.length === 0) {
    console.log('No publishable packages yet; skipping pack:check.');
    return;
  }

  let failed = false;
  for (const packageDir of packages) {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      console.error(`${manifest.name}: missing a non-empty "files" allowlist in package.json.`);
      failed = true;
      continue;
    }

    const entries = packDryRun(packageDir, npmExecPath);
    const offenders = checkTarballEntries(entries);
    if (offenders.length > 0) {
      console.error(
        `${manifest.name}: tarball would contain disallowed files:\n${offenders.map((file) => `  - ${file}`).join('\n')}`,
      );
      failed = true;
      continue;
    }

    console.log(`${manifest.name}: ok (${entries.length} files)`);
  }

  if (failed) process.exit(1);
}

main();
