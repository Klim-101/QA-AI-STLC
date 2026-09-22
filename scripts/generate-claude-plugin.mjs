// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Generates the installable Claude Code plugin (`adapters/claude-plugin/`, P2-11) from `agents/`
// (skills, hub, phase prompts, references), the hook script under `scripts/claude-plugin/`, and
// `plugin.config.ts`. `agents/` and `plugin.config.ts` stay the only hand-edited sources; `--check`
// verifies the generated tree still matches them and flags any file that does not belong there
// (a manual edit), the same contract `generate-claude-rules.mjs` already applies to `.claude/rules`.
// Run with `node --experimental-strip-types` (see package.json) so `plugin.config.ts` can be
// imported directly, the same way `vitest.config.ts` is loaded without a separate build step.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

const repoRoot = join(import.meta.dirname, '..');
const outDir = join(repoRoot, 'adapters', 'claude-plugin');
const agentsDir = join(repoRoot, 'agents');
const hookSourcePath = join(repoRoot, 'scripts', 'claude-plugin', 'block-qa-writes.mjs');

const { default: pluginConfig } = await import(pathToFileURL(join(repoRoot, 'plugin.config.ts')).href);
const mcpServerPackage = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'mcp-server', 'package.json'), 'utf8'),
);
const engineVersion = mcpServerPackage.version;

/** Every file under `dir`, as paths relative to `dir` using `/`, sorted for deterministic output. */
function listFilesRecursive(dir) {
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
function copyDirectory(sourceDir, outRelativeDir, files) {
  for (const relativePath of listFilesRecursive(sourceDir)) {
    files.set(join(outRelativeDir, relativePath).replaceAll('\\', '/'), {
      content: readFileSync(join(sourceDir, relativePath), 'utf8'),
    });
  }
}

async function renderJson(value, outPath) {
  const config = await resolveConfig(outPath);
  return format(JSON.stringify(value), { ...config, filepath: outPath });
}

async function buildFiles() {
  const files = new Map();

  for (const skillName of readdirSync(join(agentsDir, 'skills'))) {
    // `_example` is a format template, never a real skill (agents/README.md) — it must never ship.
    if (skillName === '_example') {
      continue;
    }
    copyDirectory(join(agentsDir, 'skills', skillName), join('skills', skillName), files);
  }
  copyDirectory(join(agentsDir, 'hub'), 'hub', files);
  copyDirectory(join(agentsDir, 'phase-prompts'), 'phase-prompts', files);
  copyDirectory(join(agentsDir, 'references'), 'references', files);

  files.set('hooks/block-qa-writes.mjs', { content: readFileSync(hookSourcePath, 'utf8') });

  const hooksJsonPath = join(outDir, 'hooks', 'hooks.json');
  files.set('hooks/hooks.json', {
    content: await renderJson(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                {
                  type: 'command',
                  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/block-qa-writes.mjs"',
                },
              ],
            },
          ],
        },
      },
      hooksJsonPath,
    ),
  });

  const mcpJsonPath = join(outDir, '.mcp.json');
  files.set('.mcp.json', {
    content: await renderJson(
      {
        mcpServers: {
          [pluginConfig.name]: {
            command: 'npx',
            args: ['-y', `${pluginConfig.mcpPackage}@${engineVersion}`],
          },
        },
      },
      mcpJsonPath,
    ),
  });

  const pluginJsonPath = join(outDir, '.claude-plugin', 'plugin.json');
  files.set('.claude-plugin/plugin.json', {
    content: await renderJson(
      {
        name: pluginConfig.name,
        displayName: pluginConfig.displayName,
        version: engineVersion,
        description: pluginConfig.description,
        author: pluginConfig.author,
        homepage: pluginConfig.homepage,
        repository: pluginConfig.repository,
        license: pluginConfig.license,
        keywords: [...pluginConfig.keywords],
      },
      pluginJsonPath,
    ),
  });

  return files;
}

function readExisting(absolutePath) {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function existingRelativePaths() {
  try {
    if (!statSync(outDir).isDirectory()) {
      return [];
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return listFilesRecursive(outDir);
}

const files = await buildFiles();
const checkOnly = process.argv.includes('--check');

if (!checkOnly) {
  rmSync(outDir, { recursive: true, force: true });
  for (const [relativePath, { content }] of files) {
    const absolutePath = join(outDir, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  console.log(`Generated ${files.size} file(s) in ${relative(repoRoot, outDir)}.`);
  process.exit(0);
}

let outOfDate = false;
for (const [relativePath, { content }] of files) {
  const absolutePath = join(outDir, relativePath);
  if (readExisting(absolutePath) !== content) {
    console.error(`${relative(repoRoot, absolutePath)} does not match its source. Run "npm run generate".`);
    outOfDate = true;
  }
}

const expectedPaths = new Set(files.keys());
for (const relativePath of existingRelativePaths()) {
  if (!expectedPaths.has(relativePath)) {
    console.error(
      `${join(relative(repoRoot, outDir), relativePath)} is not generated from any known source.`,
    );
    outOfDate = true;
  }
}

if (outOfDate) {
  process.exit(1);
}
console.log(`${relative(repoRoot, outDir)} is up to date.`);
