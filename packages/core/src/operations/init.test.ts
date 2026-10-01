// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '../errors.js';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { runInit } from './init.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

const FULL_SCOPE = {
  e2e: 'out-of-scope',
  api: 'out-of-scope',
  a11y: 'out-of-scope',
  security: 'out-of-scope',
} as const;

function fakeContext(initialFiles: Readonly<Record<string, string>> = {}) {
  return createFakeEngineContext({
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(initialFiles),
  });
}

describe('runInit', () => {
  it('creates config.yaml and .gitignore on an empty folder when every type is answered', async () => {
    const context = fakeContext();
    const result = await runInit(context, { testing: FULL_SCOPE });

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toStrictEqual(['config.yaml', '.gitignore', 'config.local.yaml.example']);
    expect(await context.fs.pathExists(join(QA_DIR, 'config.yaml'))).toBe(true);
    expect(await context.fs.pathExists(join(QA_DIR, '.gitignore'))).toBe(true);
  });

  it('writes the answered testing scope into config.yaml', async () => {
    const context = fakeContext();
    const testing = {
      e2e: 'in-scope',
      api: 'out-of-scope',
      a11y: 'in-scope',
      security: 'out-of-scope',
    } as const;

    await runInit(context, { testing });

    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as { testing: unknown };
    expect(written.testing).toStrictEqual(testing);
  });

  it('creates every committed subdirectory from the documented layout', async () => {
    const context = fakeContext();
    await runInit(context, { testing: FULL_SCOPE });

    for (const name of ['artifacts', 'selectors', 'runs', 'evidence', 'reports']) {
      expect(await context.fs.pathExists(join(QA_DIR, name))).toBe(true);
    }
  });

  it('throws when a testing type is left undecided and --defer-scope was not given', async () => {
    const context = fakeContext();

    await expect(runInit(context, { testing: { e2e: 'in-scope' } })).rejects.toThrow(QaError);
  });

  it('names every undecided type in the error message', async () => {
    const context = fakeContext();

    await expect(runInit(context, { testing: { e2e: 'in-scope' } })).rejects.toThrow(/api, a11y, security/);
  });

  it('allows an undecided type when deferScope is set, writing "undecided" for it', async () => {
    const context = fakeContext();

    const result = await runInit(context, { testing: { e2e: 'in-scope' }, deferScope: true });

    expect(result.created).toContain('config.yaml');
    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      testing: { api: string };
    };
    expect(written.testing.api).toBe('undecided');
  });

  it('throws when api is in-scope but no apiSource is given', async () => {
    const context = fakeContext();

    await expect(runInit(context, { testing: { ...FULL_SCOPE, api: 'in-scope' } })).rejects.toThrow(QaError);
  });

  it('writes an api block when api is in-scope and apiSource is given', async () => {
    const context = fakeContext();

    await runInit(context, { testing: { ...FULL_SCOPE, api: 'in-scope' }, apiSource: 'discover' });

    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      api: { source: string };
    };
    expect(written.api.source).toBe('discover');
  });

  it('writes a source block when sourcePath is given', async () => {
    const context = fakeContext();

    await runInit(context, { testing: FULL_SCOPE, sourcePath: 'app-src' });

    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      source: { path: string };
    };
    expect(written.source.path).toBe('app-src');
  });

  it('does not overwrite an existing config.yaml on a second run, and does not require scope answers', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    const result = await runInit(context);

    expect(result.alreadyInitialized).toBe(true);
    expect(result.created).toStrictEqual(['.gitignore', 'config.local.yaml.example']);
    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).toBe('custom: true');
  });

  it('adds the local configuration layer to an existing .gitignore that lacks it', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: 'custom: true',
      [join(QA_DIR, '.gitignore')]: '/runs/',
    });
    await runInit(context);

    expect(await context.fs.readFile(join(QA_DIR, '.gitignore'))).toBe('/runs/\n/config.local.yaml\n');
  });

  it('appends the local layer entry without a blank line to a .gitignore ending in a newline or empty', async () => {
    const endsInNewline = fakeContext({ [join(QA_DIR, '.gitignore')]: '/runs/\r\n' });
    await runInit(endsInNewline, { testing: FULL_SCOPE });
    const empty = fakeContext({ [join(QA_DIR, '.gitignore')]: '' });
    await runInit(empty, { testing: FULL_SCOPE });

    expect(await endsInNewline.fs.readFile(join(QA_DIR, '.gitignore'))).toBe(
      '/runs/\r\n/config.local.yaml\n',
    );
    expect(await empty.fs.readFile(join(QA_DIR, '.gitignore'))).toBe('/config.local.yaml\n');
  });

  it('leaves an existing .gitignore that already ignores the local layer unchanged', async () => {
    const gitignore = '/runs/\r\n/config.local.yaml\r\n';
    const context = fakeContext({ [join(QA_DIR, '.gitignore')]: gitignore });
    await runInit(context, { testing: FULL_SCOPE });

    expect(await context.fs.readFile(join(QA_DIR, '.gitignore'))).toBe(gitignore);
  });

  it('still creates the .qa/ layout when config.yaml already exists', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    await runInit(context);

    expect(await context.fs.pathExists(join(QA_DIR, 'selectors'))).toBe(true);
  });

  it('overwrites an existing config.yaml when force is set and scope is answered', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    const result = await runInit(context, { force: true, testing: FULL_SCOPE });

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toStrictEqual(['config.yaml', '.gitignore', 'config.local.yaml.example']);
    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).not.toBe('custom: true');
  });

  it('requires scope answers when force is set, just like a fresh init', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });

    await expect(runInit(context, { force: true })).rejects.toThrow(QaError);
  });

  it('writes a commented config.local.yaml.example (P6-24, ADR-011)', async () => {
    const context = fakeContext();

    await runInit(context, { testing: FULL_SCOPE });

    const example = await context.fs.readFile(join(QA_DIR, 'config.local.yaml.example'));
    expect(example).toContain('environments:');
    expect(example.split('\n').every((line) => line.trim().length === 0 || line.startsWith('#'))).toBe(true);
  });

  it('never overwrites an existing config.local.yaml.example without force', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.local.yaml.example')]: '# my own notes\n' });

    const result = await runInit(context, { testing: FULL_SCOPE });

    expect(result.created).not.toContain('config.local.yaml.example');
    expect(await context.fs.readFile(join(QA_DIR, 'config.local.yaml.example'))).toBe('# my own notes\n');
  });

  it('overwrites config.local.yaml.example when force is set', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: 'custom: true',
      [join(QA_DIR, 'config.local.yaml.example')]: '# my own notes\n',
    });

    const result = await runInit(context, { force: true, testing: FULL_SCOPE });

    expect(result.created).toContain('config.local.yaml.example');
    expect(await context.fs.readFile(join(QA_DIR, 'config.local.yaml.example'))).toContain('environments:');
  });

  describe('component library (P6-36)', () => {
    async function readUi(context: ReturnType<typeof fakeContext>): Promise<unknown> {
      const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as { ui?: unknown };
      return written.ui;
    }

    it.each(['none', 'kendo-jquery', 'kendo-angular'] as const)(
      'records %s as ui.componentLibrary',
      async (componentLibrary) => {
        const context = fakeContext();
        await runInit(context, { testing: FULL_SCOPE, componentLibrary });

        expect(await readUi(context)).toStrictEqual({ componentLibrary });
      },
    );

    it('writes no ui block when the library was not answered', async () => {
      const context = fakeContext();
      await runInit(context, { testing: FULL_SCOPE });

      expect(await readUi(context)).toBeUndefined();
    });
  });

  describe('accessibility target (P6-25)', () => {
    const A11Y_IN_SCOPE = { ...FULL_SCOPE, a11y: 'in-scope' } as const;

    async function readA11y(context: ReturnType<typeof fakeContext>): Promise<unknown> {
      const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as { a11y?: unknown };
      return written.a11y;
    }

    it('records the default WCAG 2.1 AA target when a11y is in scope and nothing was answered', async () => {
      const context = fakeContext();
      await runInit(context, { testing: A11Y_IN_SCOPE });

      expect(await readA11y(context)).toStrictEqual({
        wcagVersion: '2.1',
        level: 'AA',
        bestPractices: false,
      });
    });

    it('records the answered target, defaulting the parts left out', async () => {
      const context = fakeContext();
      await runInit(context, { testing: A11Y_IN_SCOPE, a11yTarget: { level: 'AAA', wcagVersion: '2.2' } });

      expect(await readA11y(context)).toStrictEqual({
        wcagVersion: '2.2',
        level: 'AAA',
        bestPractices: false,
      });
    });

    it('writes no a11y block when a11y is out of scope', async () => {
      const context = fakeContext();
      await runInit(context, { testing: FULL_SCOPE });

      expect(await readA11y(context)).toBeUndefined();
    });

    it('rejects a target when a11y is not in scope, and writes nothing', async () => {
      const context = fakeContext();

      await expect(
        runInit(context, { testing: FULL_SCOPE, a11yTarget: { level: 'AAA' } }),
      ).rejects.toMatchObject({ code: 'INIT_A11Y_NOT_IN_SCOPE' });
      expect(await context.fs.pathExists(join(QA_DIR, 'config.yaml'))).toBe(false);
    });
  });
});
