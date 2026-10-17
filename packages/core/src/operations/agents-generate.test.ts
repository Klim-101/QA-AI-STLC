// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runAgentsGenerate } from './agents-generate.js';

function configYaml(models: string): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    `agents: { parallelism: 2, spokeTimeoutSeconds: 60, retries: 1${models} }`,
    '',
  ].join('\n');
}

const CONFIG_PATH = join('project', '.qa', 'config.yaml');
const EXPLORER_PATH = join('project', '.claude', 'agents', 'qa-explorer.md');

describe('runAgentsGenerate', () => {
  it('writes every subagent with the model the config routes it to', async () => {
    const context = createFakeEngineContext({
      fs: createFakeFileSystem({ [CONFIG_PATH]: configYaml(', models: { explorer: haiku }') }),
    });

    const result = await runAgentsGenerate(context);

    expect(result.directory).toBe('.claude/agents');
    expect(result.subagents).toHaveLength(7);
    expect(result.subagents[0]).toEqual({
      spokeId: 'explorer',
      path: '.claude/agents/qa-explorer.md',
      model: 'haiku',
    });
    expect(result.subagents[1]?.model).toBe('inherit');
    expect(await context.fs.readFile(EXPLORER_PATH)).toContain('model: haiku');
  });

  it('rewrites a file it generated earlier with the new model', async () => {
    const fs = createFakeFileSystem({ [CONFIG_PATH]: configYaml(', models: { explorer: haiku }') });
    await runAgentsGenerate(createFakeEngineContext({ fs }));
    await fs.writeFile(CONFIG_PATH, configYaml(', models: { explorer: opus }'));

    await runAgentsGenerate(createFakeEngineContext({ fs }));

    expect(await fs.readFile(EXPLORER_PATH)).toContain('model: opus');
  });

  it('refuses to overwrite a file of the same name it did not generate, and writes nothing', async () => {
    const fs = createFakeFileSystem({
      [CONFIG_PATH]: configYaml(''),
      [join('project', '.claude', 'agents', 'qa-rca.md')]: 'my own agent',
    });

    await expect(runAgentsGenerate(createFakeEngineContext({ fs }))).rejects.toMatchObject({
      code: 'AGENTS_FILE_NOT_GENERATED',
    });
    expect(await fs.pathExists(EXPLORER_PATH)).toBe(false);
  });

  it('needs the project configuration', async () => {
    await expect(runAgentsGenerate(createFakeEngineContext())).rejects.toMatchObject({
      code: 'CONFIG_MISSING',
    });
  });
});
