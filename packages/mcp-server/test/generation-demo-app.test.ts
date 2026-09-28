// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { casesAddTool } from '../src/tools/cases-add.js';
import { exploreTool } from '../src/tools/explore.js';
import { generationRegisterTool } from '../src/tools/generation-register.js';
import { generationSpokeInputTool } from '../src/tools/generation-spoke-input.js';
import { generationVerifyTool } from '../src/tools/generation-verify.js';
import { scopeTool } from '../src/tools/scope.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports every other package's own demo-app test uses.
const PORT = 4396;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ChildProcess;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Demo app did not become reachable at ${url} within ${String(timeoutMs)}ms`);
}

// A scratch project inside the checkout, not `os.tmpdir()`: the generated spec's own
// `import { test } from '@playwright/test'` only resolves via Node's directory-walking lookup
// when the project sits somewhere under this repo's hoisted `node_modules/` — the same reasoning
// `docs/public/ci-usage.md`'s own example workflow documents for its scratch project.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.generation-demo-app-scratch');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}login", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

let originalCwd: string;

beforeAll(async () => {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath === undefined) {
    throw new Error('This test must run through an npm script (npm_execpath is unset).');
  }
  demoApp = spawn(process.execPath, [npmExecPath, 'run', 'start', '--workspace', '@qa-ai-stlc/demo-app'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DEMO_APP_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer(`${BASE_URL}login`, STARTUP_TIMEOUT_MS);

  originalCwd = process.cwd();
  await rm(PROJECT_ROOT, { recursive: true, force: true });
  await mkdir(join(PROJECT_ROOT, '.qa'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
  process.chdir(PROJECT_ROOT);

  await scopeTool.handler({
    from: 'text',
    label: 'login',
    content: '## Login\nA registered user can log in with valid credentials.\n',
  });
  await writeFile(
    join(PROJECT_ROOT, 'login-generated.json'),
    JSON.stringify({
      id: 'login-generated',
      feature: 'login',
      requirementIds: ['login'],
      testType: 'e2e',
      title: 'A registered user can log in',
      steps: [{ description: 'Submit valid credentials' }],
      expectedResult: 'The dashboard greets the logged-in user',
      status: 'approved',
      createdAt: '2026-09-27T09:00:00Z',
    }),
    'utf-8',
  );
  await casesAddTool.handler({ path: 'login-generated.json' });

  // A real crawl against the real running demo app, the same call `qa explore` makes, so
  // `tests/qa/locators.ts` carries a real `GENERATOR_VERSION` stamp qa.generation_spoke_input reads
  // back rather than assuming (P3-20's "verify, don't trust convention" applied here too).
  await exploreTool.handler({ environment: 'staging' });
}, STARTUP_TIMEOUT_MS + 15_000);

afterAll(async () => {
  demoApp.kill();
  process.chdir(originalCwd);
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

// Proves the generation contract's verification loop (P3-06/P3-07) works end to end through the
// actual MCP tool surface an agent host would call — qa.generation_spoke_input,
// qa.generation_verify, qa.generation_register — against a real project, a real running
// application and the real Playwright Test runner, with no model call anywhere in the loop: the
// "generated" content below is a deterministic fixture standing in for what a spoke would produce,
// the same role `demo-app-login.playwright-spec.ts` already plays for a hand-written spec.
describe('generation verification loop (demo app, no LLM)', () => {
  it(
    'verifies and registers a real generated spec that fully covers its case',
    async () => {
      const spokeInput = await generationSpokeInputTool.handler({
        testCaseId: 'login-generated',
        elementIds: [],
      });

      const content = [
        "import { expect, test } from '@playwright/test';",
        '',
        'test(',
        "  'a registered user can log in',",
        '  {',
        '    annotation: [',
        "      { type: 'testCaseId', description: 'login-generated' },",
        "      { type: 'stepIds', description: 'step-1,expected-result' },",
        '    ],',
        '  },',
        '  async ({ page }) => {',
        "    await test.step('[step-1] Submit valid credentials', async () => {",
        "      await page.goto('/login');",
        "      await page.fill('#email', 'admin@example.com');",
        "      await page.fill('input[name=\"password\"]', 'admin123');",
        "      await page.getByRole('button', { name: 'Log in' }).click();",
        '    });',
        "    await test.step('[expected-result] The dashboard loads', async () => {",
        '      await expect(page).toHaveURL(/\\/dashboard/);',
        "      await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();",
        '    });',
        '  },',
        ');',
        '',
      ].join('\n');

      const outcome = await generationVerifyTool.handler({
        input: spokeInput,
        content,
        filePath: 'tests/qa/generated/login-verified.spec.ts',
        generatorVersion: spokeInput.locatorModule.generatorVersion,
      });

      expect(outcome.status).toBe('verified');
      if (outcome.status !== 'verified' || outcome.spec === undefined) {
        throw new Error('Expected a verified outcome with a spec.');
      }

      const registered = await generationRegisterTool.handler({
        spec: outcome.spec,
        verificationId: outcome.verificationId,
      });

      expect(registered.filePath).toBe('tests/qa/generated/login-verified.spec.ts');
      const written = await readFile(join(PROJECT_ROOT, registered.filePath), 'utf-8');
      expect(written).toBe(content);
      const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, '.qa', 'manifest.json'), 'utf-8')) as {
        artifacts: Record<string, unknown>;
      };
      expect(manifest.artifacts).toHaveProperty(registered.filePath);

      // P4-13: one verification authorizes one registration.
      const reused = await generationRegisterTool
        .handler({ spec: outcome.spec, verificationId: outcome.verificationId })
        .catch((caught: unknown) => caught);
      expect(reused).toMatchObject({ code: 'core.verification.already_consumed' });
    },
    STARTUP_TIMEOUT_MS,
  );

  // The literal regression this whole capability exists for (P3-20): a generated spec whose body
  // is empty — only a testCaseId annotation, no assertions, no "stepIds" declaration — must not be
  // silently accepted as covering the case just because Playwright itself reports it "passed".
  it(
    'rejects a generated spec with an empty body instead of reporting it verified',
    async () => {
      const spokeInput = await generationSpokeInputTool.handler({
        testCaseId: 'login-generated',
        elementIds: [],
      });

      const content = [
        "import { test } from '@playwright/test';",
        '',
        'test(',
        "  'an empty generated spec',",
        "  { annotation: { type: 'testCaseId', description: 'login-generated' } },",
        '  async () => {},',
        ');',
        '',
      ].join('\n');

      const outcome = await generationVerifyTool.handler({
        input: spokeInput,
        content,
        filePath: 'tests/qa/generated/login-empty.spec.ts',
        generatorVersion: spokeInput.locatorModule.generatorVersion,
      });

      expect(outcome.status).not.toBe('verified');
      expect(outcome.issues?.length).toBeGreaterThan(0);
    },
    STARTUP_TIMEOUT_MS,
  );
});
