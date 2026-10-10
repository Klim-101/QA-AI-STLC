// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
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

let demoApp: ManagedServer;

// A scratch project inside the checkout, not `os.tmpdir()`: the generated spec's own
// `import { test } from '@playwright/test'` only resolves via Node's directory-walking lookup
// when the project sits somewhere under this repo's hoisted `node_modules/` — the same reasoning
// `docs/public/ci-usage.md`'s own example workflow documents for its scratch project.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.generation-demo-app-scratch');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: in-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}login", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'api: { contract: openapi, source: openapi.json }',
  'apiAuth:',
  '  profiles:',
  `    demo-oauth: { type: oauth2-client-credentials, tokenUrl: "${BASE_URL}oauth/token", clientIdVariable: QA_DEMO_CLIENT_ID, clientSecretVariable: QA_DEMO_CLIENT_SECRET }`,
  '  defaults: {}',
  '',
].join('\n');

let originalCwd: string;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);

  process.env.QA_DEMO_CLIENT_ID = 'demo-client';
  process.env.QA_DEMO_CLIENT_SECRET = 'demo-secret';
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

  // The contract the demo app serves, copied into the project so a later test can change it.
  await writeFile(
    join(PROJECT_ROOT, 'openapi.json'),
    await (await fetch(`${BASE_URL}openapi.json`)).text(),
    'utf-8',
  );
  await writeFile(
    join(PROJECT_ROOT, 'whoami-api.json'),
    JSON.stringify({
      id: 'whoami-api',
      feature: 'auth',
      requirementIds: ['login'],
      testType: 'api',
      title: 'whoami rejects a request with no token',
      steps: [{ description: 'Call GET /api/whoami with no Authorization header' }],
      expectedResult: 'The API answers 401',
      endpoints: [{ method: 'GET', path: '/api/whoami' }],
      status: 'approved',
      createdAt: '2026-09-30T09:00:00Z',
    }),
    'utf-8',
  );
  await casesAddTool.handler({ path: 'whoami-api.json' });

  // A real crawl against the real running demo app, the same call `qa explore` makes, so
  // `tests/qa/locators.ts` carries a real `GENERATOR_VERSION` stamp qa.generation_spoke_input reads
  // back rather than assuming (P3-20's "verify, don't trust convention" applied here too).
  await exploreTool.handler({ environment: 'staging' });
}, STARTUP_TIMEOUT_MS + 15_000);

afterAll(async () => {
  await demoApp.stop();
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
        generatorVersion: spokeInput.locatorModule?.generatorVersion ?? 'unknown',
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
        generatorVersion: spokeInput.locatorModule?.generatorVersion ?? 'unknown',
      });

      expect(outcome.status).not.toBe('verified');
      expect(outcome.issues?.length).toBeGreaterThan(0);
    },
    STARTUP_TIMEOUT_MS,
  );
});

// P6-13's exit criterion against the real app: a generated API spec for a demo-app endpoint passes
// the verification loop, and is rejected once the contract it was generated against changes.
describe('api spec generation (demo app, no LLM)', () => {
  function apiSpecContent(contractSha256: string): string {
    return [
      "import { expect, test } from '@playwright/test';",
      '',
      `export const CONTRACT_SHA256 = "${contractSha256}";`,
      '',
      'test(',
      "  'whoami rejects a request with no token',",
      '  {',
      '    annotation: [',
      "      { type: 'testCaseId', description: 'whoami-api' },",
      "      { type: 'stepIds', description: 'step-1,expected-result' },",
      '    ],',
      '  },',
      '  async ({ request }) => {',
      "    const response = await test.step('[step-1] Call GET /api/whoami with no Authorization header', async () =>",
      "      request.get('/api/whoami'),",
      '    );',
      "    await test.step('[expected-result] The API answers 401', async () => {",
      '      expect(response.status()).toBe(401);',
      '    });',
      '  },',
      ');',
      '',
    ].join('\n');
  }

  // P6-35's exit criterion against the real app: a generated API spec for an authenticated
  // endpoint passes, and nothing in the spec source (or the helper it imports) is a credential.
  describe('authenticated api spec', () => {
    function authSpecContent(contractSha256: string, assertion: string): string {
      return [
        "import { expect, test } from '@playwright/test';",
        "import { apiAuth } from '../api-auth.js';",
        '',
        `export const CONTRACT_SHA256 = "${contractSha256}";`,
        '',
        'test(',
        "  'whoami accepts the demo client',",
        '  {',
        '    annotation: [',
        "      { type: 'testCaseId', description: 'whoami-authenticated-api' },",
        "      { type: 'stepIds', description: 'step-1,expected-result' },",
        '    ],',
        '  },',
        '  async ({ request }) => {',
        "    const response = await test.step('[step-1] Call GET /api/whoami as the demo client', async () =>",
        "      request.get('/api/whoami', apiAuth('demo-oauth')),",
        '    );',
        "    await test.step('[expected-result] The API identifies the demo client', async () => {",
        `      ${assertion}`,
        '    });',
        '  },',
        ');',
        '',
      ].join('\n');
    }

    interface Prepared {
      readonly input: Awaited<ReturnType<typeof generationSpokeInputTool.handler>>;
      readonly sha: string;
    }
    let prepared: Prepared | undefined;

    async function prepare(): Promise<Prepared> {
      if (prepared !== undefined) {
        return prepared;
      }
      await writeFile(
        join(PROJECT_ROOT, 'whoami-authenticated-api.json'),
        JSON.stringify({
          id: 'whoami-authenticated-api',
          feature: 'auth',
          requirementIds: ['login'],
          testType: 'api',
          title: 'whoami accepts the demo client',
          steps: [{ description: 'Call GET /api/whoami as the demo client' }],
          expectedResult: 'The API identifies the demo client',
          endpoints: [{ method: 'GET', path: '/api/whoami' }],
          status: 'approved',
          createdAt: '2026-09-30T09:00:00Z',
        }),
        'utf-8',
      );
      await casesAddTool.handler({ path: 'whoami-authenticated-api.json' });
      const input = await generationSpokeInputTool.handler({
        testCaseId: 'whoami-authenticated-api',
        elementIds: [],
      });
      const sha = input.apiContract?.sha256;
      if (sha === undefined) {
        throw new Error('Expected the api spoke input to carry the contract hash.');
      }
      prepared = { input, sha };
      return prepared;
    }

    it(
      'verifies and registers a spec that authenticates through a profile, with no credential in its source',
      async () => {
        const { input, sha } = await prepare();
        const content = authSpecContent(
          sha,
          "expect(await response.json()).toMatchObject({ client: 'demo-client' });",
        );

        const outcome = await generationVerifyTool.handler({
          input,
          content,
          filePath: 'tests/qa/generated/whoami-authenticated-api.spec.ts',
          generatorVersion: '1',
        });

        expect(outcome.issues).toBeUndefined();
        expect(outcome.status).toBe('verified');
        const helper = await readFile(join(PROJECT_ROOT, 'tests', 'qa', 'api-auth.ts'), 'utf-8');
        for (const source of [content, helper, JSON.stringify(outcome)]) {
          expect(source).not.toContain('demo-secret');
          expect(source).not.toMatch(/demo-token-\d/u);
          expect(source).not.toMatch(/Bearer\s/u);
        }
      },
      STARTUP_TIMEOUT_MS,
    );

    it(
      'scrubs a token the API echoes back from the failure the agent receives',
      async () => {
        const { input, sha } = await prepare();

        const outcome = await generationVerifyTool.handler({
          input,
          content: authSpecContent(sha, "expect(await response.text()).toBe('nothing');"),
          filePath: 'tests/qa/generated/whoami-authenticated-echo.spec.ts',
          generatorVersion: '1',
        });

        expect(outcome.status).toBe('execution_failed');
        const reported = JSON.stringify(outcome);
        expect(reported).not.toMatch(/demo-token-\d/u);
        expect(reported).toContain('[REDACTED]');
      },
      STARTUP_TIMEOUT_MS,
    );

    it(
      'rejects a spec that writes its own Authorization header before it runs',
      async () => {
        const { input, sha } = await prepare();
        const content = authSpecContent(sha, 'expect(response.ok()).toBe(true);').replace(
          "apiAuth('demo-oauth')",
          "{ headers: { Authorization: 'Bearer abcdefghij' } }",
        );

        const rejected = await generationVerifyTool
          .handler({
            input,
            content,
            filePath: 'tests/qa/generated/whoami-authenticated-literal.spec.ts',
            generatorVersion: '1',
          })
          .catch((caught: unknown) => caught);

        expect(rejected).toMatchObject({ code: 'HTTP_CREDENTIAL_INPUT_REJECTED' });
      },
      STARTUP_TIMEOUT_MS,
    );
  });

  it(
    'verifies and registers a spec stamped with the contract hash, then rejects it once the contract changes',
    async () => {
      const spokeInput = await generationSpokeInputTool.handler({
        testCaseId: 'whoami-api',
        elementIds: [],
      });
      const contractSha256 = spokeInput.apiContract?.sha256;
      if (contractSha256 === undefined) {
        throw new Error('Expected the api spoke input to carry the contract hash.');
      }
      expect(spokeInput.registrySlice).toBeUndefined();
      expect(spokeInput.apiContract?.operations.map((operation) => operation.path)).toEqual(['/api/whoami']);

      const outcome = await generationVerifyTool.handler({
        input: spokeInput,
        content: apiSpecContent(contractSha256),
        filePath: 'tests/qa/generated/whoami-api.spec.ts',
        generatorVersion: '1',
      });

      expect(outcome.status).toBe('verified');
      if (outcome.status !== 'verified' || outcome.spec === undefined) {
        throw new Error('Expected a verified outcome with a spec.');
      }
      const registered = await generationRegisterTool.handler({
        spec: outcome.spec,
        verificationId: outcome.verificationId,
      });
      expect(registered.filePath).toBe('tests/qa/generated/whoami-api.spec.ts');

      // A spec that does not declare the hash it was generated against is refused outright.
      const unstamped = await generationVerifyTool
        .handler({
          input: spokeInput,
          content: apiSpecContent(contractSha256).replace(contractSha256, 'f'.repeat(64)),
          filePath: 'tests/qa/generated/whoami-api.spec.ts',
          generatorVersion: '1',
        })
        .catch((caught: unknown) => caught);
      expect(unstamped).toMatchObject({ code: 'core.verification.contract_stamp_mismatch' });

      // The contract changes after the spec was generated: the same spec is now rejected.
      await writeFile(
        join(PROJECT_ROOT, 'openapi.json'),
        JSON.stringify({
          openapi: '3.0.3',
          paths: { '/api/whoami': { get: { operationId: 'whoami', description: 'changed' } } },
        }),
        'utf-8',
      );
      const stale = await generationVerifyTool
        .handler({
          input: spokeInput,
          content: apiSpecContent(contractSha256),
          filePath: 'tests/qa/generated/whoami-api.spec.ts',
          generatorVersion: '1',
        })
        .catch((caught: unknown) => caught);
      expect(stale).toMatchObject({ code: 'API_SPEC_CONTRACT_CHANGED' });
    },
    STARTUP_TIMEOUT_MS,
  );
});
