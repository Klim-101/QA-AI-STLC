// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPOKE_DEFINITION_IDS } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  GENERATED_SUBAGENT_MARKER,
  listSpokeDefinitionIds,
  renderSpokeSubagents,
} from './spoke-subagents.js';

describe('renderSpokeSubagents', () => {
  it('writes one subagent per spoke definition under .claude/agents', () => {
    const subagents = renderSpokeSubagents({});

    expect(subagents.map((subagent) => subagent.path)).toEqual([
      '.claude/agents/qa-explorer.md',
      '.claude/agents/qa-test-design.md',
      '.claude/agents/qa-case-execution.md',
      '.claude/agents/qa-test-generation.md',
      '.claude/agents/qa-triage.md',
      '.claude/agents/qa-reviewer.md',
      '.claude/agents/qa-rca.md',
    ]);
    expect(listSpokeDefinitionIds()).toEqual(SPOKE_DEFINITION_IDS);
  });

  it('carries the configured model of each spoke and leaves an unrouted one to inherit', () => {
    const subagents = renderSpokeSubagents({ explorer: 'haiku', 'test-generation': 'claude-opus-5-5' });
    const byId = new Map(subagents.map((subagent) => [subagent.spokeId, subagent]));

    expect(byId.get('explorer')?.content).toContain('\nmodel: haiku\n');
    expect(byId.get('explorer')?.model).toBe('haiku');
    expect(byId.get('test-generation')?.content).toContain('\nmodel: claude-opus-5-5\n');
    expect(byId.get('qa-rca')?.content).not.toContain('model:');
    expect(byId.get('qa-rca')).not.toHaveProperty('model');
  });

  it('gives a spoke with no skill its own rules instead of a skill to load', () => {
    const triage = renderSpokeSubagents({}).find((subagent) => subagent.spokeId === 'triage');

    expect(triage?.content).not.toContain('skill and follow it');
    expect(triage?.content).toContain('`qa.triage_input`');
    expect(triage?.content).toContain('UNTRUSTED EVIDENCE');
  });

  it('tells the reviewer to judge the spec without asking for the author reasoning', () => {
    const reviewer = renderSpokeSubagents({}).find((subagent) => subagent.spokeId === 'reviewer');

    expect(reviewer?.content).toContain('`qa.review_input`');
    expect(reviewer?.content).toContain('You get no word of the author');
    expect(reviewer?.content).toContain('`qa.review_add`');
  });

  it('takes the reviewer file, shell and web tools away, so it can reach only what the engine hands it', () => {
    const subagents = renderSpokeSubagents({});
    const reviewer = subagents.find((subagent) => subagent.spokeId === 'reviewer');

    expect(reviewer?.content).toContain(
      '\ndisallowedTools: Read, Grep, Glob, Bash, Write, Edit, NotebookEdit, WebFetch, WebSearch\n',
    );
    expect(
      subagents
        .filter((subagent) => subagent.content.includes('disallowedTools:'))
        .map((subagent) => subagent.spokeId),
    ).toEqual(['reviewer']);
  });

  it('names the skill, the task and the result envelope, and marks the file as generated', () => {
    const [explorer] = renderSpokeSubagents({});

    expect(explorer?.content).toMatch(/^---\nname: qa-explorer\ndescription: "Use when /u);
    expect(explorer?.content).toContain(GENERATED_SUBAGENT_MARKER);
    expect(explorer?.content).toContain('Load the `qa-explore` skill');
    expect(explorer?.content).toContain('"status": "ok"');
  });

  it('has a contract file in agents/hub/spokes for every spoke definition', () => {
    const spokesDirectory = fileURLToPath(new URL('../../../agents/hub/spokes', import.meta.url));

    expect(readdirSync(spokesDirectory).toSorted()).toEqual(
      SPOKE_DEFINITION_IDS.map((id) => `${id}.md`).toSorted(),
    );
  });
});
