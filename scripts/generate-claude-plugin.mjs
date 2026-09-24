// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Generates the installable Claude Code plugin (`adapters/claude-plugin/`, P2-11) from `agents/`
// (skills, hub, phase prompts, references), the hook script under `scripts/claude-plugin/`, and
// `plugin.config.ts`. It also generates a `claude plugin eval` suite under `evals/` from each
// skill's `triggers`/`nonTriggers` frontmatter (P2-10) — a local, hand-run check; CI wiring is a
// separate task (P2-23), since each eval run is a real, billed model call. It also generates the
// repository root's own `.claude-plugin/marketplace.json` (P2-15), which declares this same
// generated plugin by a relative `source`, so this public repository is itself installable as a
// Claude Code marketplace (`claude plugin marketplace add <owner>/<repo>`) with no separate
// marketplace repository to keep in sync. `agents/` and `plugin.config.ts` stay the only
// hand-edited sources; `--check` verifies the generated tree still matches them and flags any file
// that does not belong there (a manual edit), the same contract `generate-claude-rules.mjs` already
// applies to `.claude/rules`. Run with `node --experimental-strip-types` (see package.json) so
// `plugin.config.ts` can be imported directly, the same way `vitest.config.ts` is loaded without a
// separate build step.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const repoRoot = join(import.meta.dirname, '..');
const outDir = join(repoRoot, 'adapters', 'claude-plugin');
const agentsDir = join(repoRoot, 'agents');
const hookSourcePath = join(repoRoot, 'scripts', 'claude-plugin', 'block-qa-writes.mjs');
const marketplaceJsonPath = join(repoRoot, '.claude-plugin', 'marketplace.json');

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

/** Reads `name`, `triggers` and `nonTriggers` out of a `SKILL.md`'s YAML frontmatter block. */
function parseSkillFrontmatter(skillMdPath) {
  const content = readFileSync(skillMdPath, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  if (!match) {
    throw new Error(`${skillMdPath} has no YAML frontmatter block.`);
  }
  const frontmatter = parseYaml(match[1]);
  const { name, triggers, nonTriggers } = frontmatter;
  if (typeof name !== 'string' || !Array.isArray(triggers) || !Array.isArray(nonTriggers)) {
    throw new Error(`${skillMdPath}'s frontmatter is missing name, triggers or nonTriggers.`);
  }
  return { name, triggers, nonTriggers };
}

/**
 * One `claude plugin eval` case per trigger/nonTrigger phrase (P2-10): a trigger case asserts the
 * `Skill` tool fires with this skill's name (the grader's default `min: 1`); a nonTrigger case
 * asserts it does not (`min: 0, max: 0`). `allowed_tools: [Skill]` and a small `max_turns` price
 * out only the triggering decision itself, not the skill's full instructions actually running —
 * this plugin's `.mcp.json` server is never started for these cases.
 */
function buildEvalCase(skillName, phrase, kind, index, files) {
  const caseDir = `evals/${skillName}-${kind}-${index}`;
  files.set(`${caseDir}/prompt.md`, {
    content: `---\n${stringifyYaml({ runs: 1, max_turns: 3, allowed_tools: ['Skill'] })}---\n\n${phrase}\n`,
  });

  // A plugin's skill is addressable as `<plugin>:<skill>` once installed, so the match tolerates
  // an optional plugin-name prefix in the tool call's JSON input.
  const skillInputMatch = `"skill"\\s*:\\s*"(?:[\\w-]+:)?${skillName}"`;
  const graderFrontmatter =
    kind === 'trigger'
      ? { type: 'tool_used', tool: 'Skill', input_match: skillInputMatch }
      : { type: 'tool_used', tool: 'Skill', input_match: skillInputMatch, min: 0, max: 0 };
  const graderName = kind === 'trigger' ? 'skill-fired.md' : 'skill-not-fired.md';
  files.set(`${caseDir}/graders/${graderName}`, {
    content: `---\n${stringifyYaml(graderFrontmatter)}---\n`,
  });
}

async function buildFiles() {
  const files = new Map();

  for (const skillName of readdirSync(join(agentsDir, 'skills'))) {
    // `_example` is a format template, never a real skill (agents/README.md) — it must never ship.
    if (skillName === '_example') {
      continue;
    }
    const skillDir = join(agentsDir, 'skills', skillName);
    copyDirectory(skillDir, join('skills', skillName), files);

    const { name, triggers, nonTriggers } = parseSkillFrontmatter(join(skillDir, 'SKILL.md'));
    triggers.forEach((phrase, index) => buildEvalCase(name, phrase, 'trigger', index + 1, files));
    nonTriggers.forEach((phrase, index) => {
      buildEvalCase(name, phrase, 'nontrigger', index + 1, files);
    });
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
            // Read by the version handshake (ADR-007) at server start so a stale npx cache or a
            // hand-edited .mcp.json produces a coded error instead of silently running a
            // different engine version than this plugin was generated against.
            env: { QA_EXPECTED_ENGINE_VERSION: engineVersion },
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

/**
 * The repository root's own marketplace manifest (P2-15): declares this same generated plugin by
 * a path relative to the repo root, so `claude plugin marketplace add <owner>/<repo>` needs no
 * separate marketplace repository or copy of the plugin to stay in sync.
 */
async function buildMarketplaceJson() {
  return renderJson(
    {
      name: pluginConfig.name,
      owner: pluginConfig.author,
      description: `${pluginConfig.description} Published from this repository's own tree.`,
      plugins: [
        {
          name: pluginConfig.name,
          source: './adapters/claude-plugin',
          description: pluginConfig.description,
        },
      ],
    },
    marketplaceJsonPath,
  );
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
const marketplaceJson = await buildMarketplaceJson();
const checkOnly = process.argv.includes('--check');

if (!checkOnly) {
  rmSync(outDir, { recursive: true, force: true });
  for (const [relativePath, { content }] of files) {
    const absolutePath = join(outDir, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  mkdirSync(dirname(marketplaceJsonPath), { recursive: true });
  writeFileSync(marketplaceJsonPath, marketplaceJson);
  console.log(
    `Generated ${files.size} file(s) in ${relative(repoRoot, outDir)} and ${relative(repoRoot, marketplaceJsonPath)}.`,
  );
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

if (readExisting(marketplaceJsonPath) !== marketplaceJson) {
  console.error(
    `${relative(repoRoot, marketplaceJsonPath)} does not match its source. Run "npm run generate".`,
  );
  outOfDate = true;
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
console.log(`${relative(repoRoot, outDir)} and ${relative(repoRoot, marketplaceJsonPath)} are up to date.`);
