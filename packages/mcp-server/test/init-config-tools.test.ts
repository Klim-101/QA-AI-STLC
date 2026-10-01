// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import type { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeEngineContext } from '../src/engine-context.js';
import { configAddTool } from '../src/tools/config-add.js';
import { configShowTool } from '../src/tools/config-show.js';
import { configSetTool } from '../src/tools/config-set.js';
import { initTool } from '../src/tools/init.js';

const OUT_OF_SCOPE = {
  e2e: 'in-scope',
  api: 'out-of-scope',
  a11y: 'out-of-scope',
  security: 'undecided',
} as const;

// A real temporary project directory, entered the way an MCP client launches the server: with the
// project as its working directory (see engine-tools.test.ts).
describe('init and config tools (real filesystem, temp project directory)', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  // Leaves the temp directory before it is removed: Windows cannot delete the working directory.
  async function withProject(run: (projectRoot: string) => Promise<void>): Promise<void> {
    await withTempDir(async (directory) => {
      const projectRoot = await realpath(directory);
      process.chdir(projectRoot);
      try {
        await run(projectRoot);
      } finally {
        process.chdir(originalCwd);
      }
    });
  }

  it('qa.init previews the root without writing, then initializes once the root is confirmed', async () => {
    await withProject(async (projectRoot) => {
      const preview = await initTool.handler({ testing: OUT_OF_SCOPE });
      const previewWroteQa = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8').catch(
        () => null,
      );
      const written = await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(preview).toStrictEqual({ projectRoot, initialized: false, created: [] });
      expect(previewWroteQa).toBeNull();
      expect(written.initialized).toBe(true);
      expect(written.created).toContain('config.yaml');
      expect(config).toContain('e2e: in-scope');
      expect(config).toContain('security: undecided');
    });
  });

  it('qa.init records sourcePath and apiSource', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({
        testing: { ...OUT_OF_SCOPE, api: 'in-scope' },
        confirmedRoot: projectRoot,
        sourcePath: '../app',
        apiSource: 'discover',
      });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(config).toContain('"../app"');
      expect(config).toContain('"discover"');
    });
  });

  it('qa.init rejects an answer set that leaves a testing type out', () => {
    const parsed = initTool.inputSchema.safeParse({ testing: { e2e: 'in-scope' } });

    expect(parsed.success).toBe(false);
  });

  it('qa.init refuses a confirmedRoot that is not the resolved root, and writes nothing', async () => {
    await withProject(async (projectRoot) => {
      await expect(
        initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: join(projectRoot, 'elsewhere') }),
      ).rejects.toMatchObject({ code: 'INIT_ROOT_MISMATCH' });
      expect(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8').catch(() => null)).toBeNull();
    });
  });

  it('qa.init refuses when .qa/ already exists in the directory and leaves its config untouched', async () => {
    await withProject(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'));
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), 'existing: true\n', 'utf-8');

      await expect(
        initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot }),
      ).rejects.toMatchObject({ code: 'INIT_ALREADY_INITIALIZED' });
      expect(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8')).toBe('existing: true\n');
    });
  });

  it('qa.init refuses from a subdirectory of an initialized project instead of creating a nested one', async () => {
    await withProject(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'));
      await mkdir(join(projectRoot, 'packages', 'web'), { recursive: true });
      process.chdir(join(projectRoot, 'packages', 'web'));

      await expect(
        initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot }),
      ).rejects.toMatchObject({ code: 'INIT_ALREADY_INITIALIZED' });
      expect(
        await readFile(join(projectRoot, 'packages', 'web', '.qa', 'config.yaml'), 'utf-8').catch(() => null),
      ).toBeNull();
    });
  });

  it('resolves the project root upward to the nearest .qa/, like qa-start', async () => {
    await withProject(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'));
      await mkdir(join(projectRoot, 'packages', 'web'), { recursive: true });
      process.chdir(join(projectRoot, 'packages', 'web'));

      expect(createNodeEngineContext().projectRoot).toBe(projectRoot);
    });
  });

  it('qa.config_set changes one testing type in the resolved project only', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });

      const result = await configSetTool.handler({ key: 'testing.security', value: 'in-scope' });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(result).toStrictEqual({ key: 'testing.security', value: 'in-scope' });
      expect(config).toContain('security: in-scope');
    });
  });

  it('qa.config_set fails without writing when no project is initialized', async () => {
    await withProject(async (projectRoot) => {
      await expect(configSetTool.handler({ key: 'testing.e2e', value: 'in-scope' })).rejects.toMatchObject({
        code: 'CONFIG_MISSING',
      });
      expect(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8').catch(() => null)).toBeNull();
    });
  });

  it('qa.config_add adds an environment and rejects an existing name without force', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });
      const environment: z.infer<typeof configAddTool.inputSchema> = {
        kind: 'environment',
        name: 'staging',
        baseUrl: 'https://staging.example.com',
        allowlist: ['staging.example.com'],
      };

      const added = await configAddTool.handler(environment);
      await expect(configAddTool.handler(environment)).rejects.toMatchObject({
        code: 'CONFIG_ADD_NAME_EXISTS',
      });
      await configAddTool.handler({
        ...environment,
        allowlist: ['staging.example.com', 'cdn.example.com'],
        force: true,
      });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(added).toStrictEqual({ kind: 'environment', name: 'staging' });
      expect(config).toContain('cdn.example.com');
    });
  });

  it('qa.config_add requires the fields of the kind it adds', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });

      await expect(configAddTool.handler({ kind: 'environment', name: 'staging' })).rejects.toMatchObject({
        code: 'CONFIG_ADD_VALUE_INVALID',
      });
      await expect(
        configAddTool.handler({ kind: 'environment', name: 'staging', baseUrl: 'https://a.example.com' }),
      ).rejects.toMatchObject({ code: 'CONFIG_ADD_VALUE_INVALID' });
      await expect(configAddTool.handler({ kind: 'identity', name: 'admin' })).rejects.toMatchObject({
        code: 'CONFIG_ADD_VALUE_INVALID',
      });
      await expect(
        configAddTool.handler({ kind: 'identity', name: 'admin', auth: 'cdp-attach' }),
      ).rejects.toMatchObject({ code: 'CONFIG_ADD_VALUE_INVALID' });
    });
  });

  it('qa.config_add stores an identity secret name and rejects a secret value', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });

      const added = await configAddTool.handler({
        kind: 'identity',
        name: 'admin',
        auth: 'storage-state',
        secret: 'QA_ADMIN_PASSWORD',
        loginUrl: 'https://staging.example.com/login',
        username: 'admin@example.com',
      });
      await expect(
        configAddTool.handler({
          kind: 'identity',
          name: 'other',
          auth: 'cdp-attach',
          secret: 'hunter2-not-a-variable-name',
        }),
      ).rejects.toMatchObject({ code: 'CONFIG_ADD_VALUE_INVALID' });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(added).toStrictEqual({ kind: 'identity', name: 'admin' });
      expect(config).toContain('secret: QA_ADMIN_PASSWORD');
      expect(config).not.toContain('hunter2');
    });
  });

  it('qa.config_add overwrites an existing identity only with force', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });
      const identity = {
        kind: 'identity',
        name: 'admin',
        auth: 'cdp-attach',
        secret: 'QA_ADMIN_PASSWORD',
      } as const;

      await configAddTool.handler(identity);
      await expect(configAddTool.handler(identity)).rejects.toMatchObject({ code: 'CONFIG_ADD_NAME_EXISTS' });
      await configAddTool.handler({ ...identity, secret: 'QA_OTHER_PASSWORD', force: true });

      expect(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8')).toContain('QA_OTHER_PASSWORD');
    });
  });

  it('qa.init records the default WCAG 2.1 AA target when a11y is in scope and none was answered', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({
        testing: { ...OUT_OF_SCOPE, a11y: 'in-scope' },
        confirmedRoot: projectRoot,
      });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(config).toContain('wcagVersion: "2.1"');
      expect(config).toContain('level: AA');
    });
  });

  it.each(['none', 'kendo-jquery', 'kendo-angular'] as const)(
    'qa.init records the component library %s',
    async (componentLibrary) => {
      await withProject(async (projectRoot) => {
        await initTool.handler({ testing: OUT_OF_SCOPE, componentLibrary, confirmedRoot: projectRoot });

        expect(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8')).toContain(
          `componentLibrary: ${componentLibrary}`,
        );
      });
    },
  );

  it('qa.config_set changes ui.componentLibrary', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: OUT_OF_SCOPE, confirmedRoot: projectRoot });

      const result = await configSetTool.handler({ key: 'ui.componentLibrary', value: 'kendo-angular' });

      expect(result).toStrictEqual({ key: 'ui.componentLibrary', value: 'kendo-angular' });
      expect(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8')).toContain(
        'componentLibrary: kendo-angular',
      );
    });
  });

  it('qa.init records the answered accessibility target', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({
        testing: { ...OUT_OF_SCOPE, a11y: 'in-scope' },
        a11y: { wcagVersion: '2.2', level: 'AAA', bestPractices: true },
        confirmedRoot: projectRoot,
      });
      const config = await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf-8');

      expect(config).toContain('wcagVersion: "2.2"');
      expect(config).toContain('level: AAA');
      expect(config).toContain('bestPractices: true');
    });
  });

  it('qa.init rejects an accessibility target when a11y is not in scope', async () => {
    await withProject(async (projectRoot) => {
      await expect(
        initTool.handler({ testing: OUT_OF_SCOPE, a11y: { level: 'AAA' }, confirmedRoot: projectRoot }),
      ).rejects.toMatchObject({ code: 'INIT_A11Y_NOT_IN_SCOPE' });
    });
  });

  it('qa.config_show reports a11y exceptions from the committed config', async () => {
    await withProject(async (projectRoot) => {
      await initTool.handler({ testing: { ...OUT_OF_SCOPE, a11y: 'in-scope' }, confirmedRoot: projectRoot });
      const path = join(projectRoot, '.qa', 'config.yaml');
      const config = await readFile(path, 'utf-8');
      await writeFile(
        path,
        config.replace(
          'bestPractices: false',
          [
            'bestPractices: false',
            '  exceptions:',
            '    - { ruleId: color-contrast, reason: Brand palette, expires: 2026-12-31 }',
          ].join('\n'),
        ),
        'utf-8',
      );

      const result = await configShowTool.handler({});

      expect(result.config.a11y.exceptions).toStrictEqual([
        { ruleId: 'color-contrast', reason: 'Brand palette', expires: '2026-12-31' },
      ]);
      expect(result.values.find((value) => value.path.join('.') === 'a11y.exceptions')?.layer).toBe(
        'committed',
      );
    });
  });
});
