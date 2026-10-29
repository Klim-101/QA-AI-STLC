// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Enforces the `SKILL.md` size cap `agents/README.md` and AGENTS.md 12.2 document: a skill stays
// readable in one load instead of growing into something that needs its own `references/` split
// but never gets it. Detail belongs under `references/`, which this script never limits.
// It also checks that a link label naming a path matches the link target as seen from the plugin
// root, because a generated plugin has no `agents/` folder above `skills/`, `hub/`, `phase-prompts/`
// and `references/`.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive } from './lib/generated-tree.mjs';
import { findMismatchedLinkLabels } from './lib/link-labels.mjs';

const MAX_SKILL_LINES = 200;
const SHIPPED_DIRECTORIES = ['skills', 'hub', 'phase-prompts', 'references'];

function findSkillFiles(directory) {
  const skillFiles = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      skillFiles.push(...findSkillFiles(entryPath));
      continue;
    }
    if (entry.name === 'SKILL.md') {
      skillFiles.push(entryPath);
    }
  }
  return skillFiles;
}

function countLines(fileContent) {
  if (fileContent.length === 0) {
    return 0;
  }
  // A trailing newline ends the last line rather than starting an empty one, so it must not
  // inflate the count by one.
  const normalized = fileContent.endsWith('\n') ? fileContent.slice(0, -1) : fileContent;
  return normalized.split('\n').length;
}

function findMarkdownFiles(agentsDirectory) {
  return SHIPPED_DIRECTORIES.flatMap((directory) =>
    listFilesRecursive(join(agentsDirectory, directory))
      .filter((path) => path.endsWith('.md'))
      .map((path) => `${directory}/${path}`),
  );
}

function main() {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const skillsDir = join(repoRoot, 'agents', 'skills');

  let skillFiles;
  try {
    skillFiles = findSkillFiles(skillsDir);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      console.log('No agents/skills directory found; nothing to lint.');
      return;
    }
    throw error;
  }

  let hasViolation = false;
  for (const skillFile of skillFiles) {
    const lineCount = countLines(readFileSync(skillFile, 'utf8'));
    const relativePath = relative(repoRoot, skillFile);
    if (lineCount > MAX_SKILL_LINES) {
      console.error(
        `${relativePath}: ${lineCount} lines, exceeds the ${MAX_SKILL_LINES}-line SKILL.md cap ` +
          '(AGENTS.md 12.2, agents/README.md). Move detail into references/.',
      );
      hasViolation = true;
    }
  }

  const markdownFiles = findMarkdownFiles(join(repoRoot, 'agents'));
  for (const markdownFile of markdownFiles) {
    const markdown = readFileSync(join(repoRoot, 'agents', markdownFile), 'utf8');
    for (const { line, label, resolved } of findMismatchedLinkLabels(markdown, markdownFile)) {
      console.error(
        `agents/${markdownFile}:${line}: link label "${label}" does not name its target "${resolved}" ` +
          'from the plugin root, where agents/ is not a folder (AGENTS.md 12.2).',
      );
      hasViolation = true;
    }
  }

  if (hasViolation) {
    process.exit(1);
  }
  console.log(
    `Checked ${skillFiles.length} SKILL.md file(s) against the ${MAX_SKILL_LINES}-line cap and ` +
      `${markdownFiles.length} file(s) for link labels. All within limit.`,
  );
}

main();
