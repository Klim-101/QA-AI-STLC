// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Requirement, RequirementSource } from '@qa-ai-stlc/schemas';

// A level-2 heading starts one requirement; anything before the first one (a document title,
// preamble) is not a requirement. Level 1 stays a section grouper, never a requirement itself, so
// a single "# Requirements" title heading does not become one giant requirement.
const HEADING_PATTERN = /^##\s+(.+?)\s*$/;

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'requirement';
}

/** Appends `-2`, `-3`, ... to `slug` until it no longer collides with an id already used. */
function dedupeId(slug: string, usedIds: ReadonlySet<string>): string {
  if (!usedIds.has(slug)) {
    return slug;
  }
  let suffix = 2;
  while (usedIds.has(`${slug}-${String(suffix)}`)) {
    suffix += 1;
  }
  return `${slug}-${String(suffix)}`;
}

/**
 * Deterministic, rule-based requirement extraction from Markdown (AGENTS.md, ADR-001: the engine
 * calls no model, so this cannot be free-form NLP extraction). Each level-2 heading (`## Title`)
 * becomes one requirement: the heading text is the title, everything up to the next level-1 or
 * level-2 heading is the description, and the id is a slug of the title, deduplicated in document
 * order for a repeated or colliding heading. A document with no level-2 heading extracts nothing —
 * not an error, since an empty result is easy for the operator to notice and fix.
 */
export function extractRequirements(content: string, source: RequirementSource): Requirement[] {
  const lines = content.split(/\r?\n/);
  const requirements: Requirement[] = [];
  const usedIds = new Set<string>();

  let currentTitle: string | undefined;
  let currentBodyLines: string[] = [];

  function flush(): void {
    if (currentTitle === undefined) {
      return;
    }
    const description = currentBodyLines.join('\n').trim();
    const id = dedupeId(slugify(currentTitle), usedIds);
    usedIds.add(id);
    requirements.push({
      id,
      title: currentTitle,
      ...(description.length > 0 ? { description } : {}),
      source,
      inScope: true,
    });
  }

  for (const line of lines) {
    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch?.[1] !== undefined) {
      flush();
      currentTitle = headingMatch[1];
      currentBodyLines = [];
      continue;
    }
    if (/^#\s+/.test(line)) {
      flush();
      currentTitle = undefined;
      currentBodyLines = [];
      continue;
    }
    if (currentTitle !== undefined) {
      currentBodyLines.push(line);
    }
  }
  flush();

  return requirements;
}
