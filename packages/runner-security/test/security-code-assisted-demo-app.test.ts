// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHttpClient,
  nodeFileSystem,
  noopLogger,
  playwrightBrowserLauncher,
  runSecurityAuthorizationAdd,
  runSecurityAuthorizationApprove,
  systemClock,
  type EngineContext,
  type ProcessRunner,
} from '@qa-ai-stlc/core';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SECURITY_CHECKS } from '../src/default-checks.js';
import { runSecurityAudit } from '../src/security-audit.js';

const DEMO_APP_DIRECTORY = fileURLToPath(new URL('../../../examples/demo-app/', import.meta.url));
const BASE_URL = 'http://localhost:4692/';

// What `npm audit --json` prints for one vulnerable direct dependency of the demo app. The audit
// would otherwise reach the package registry, which a test must not do.
const NPM_AUDIT_REPORT = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    express: {
      name: 'express',
      severity: 'high',
      isDirect: true,
      via: [{ title: 'Example advisory for a test' }],
      fixAvailable: { name: 'express', version: '5.2.2' },
    },
  },
});

function configYaml(withSource: boolean): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: in-scope }',
    ...(withSource ? ['source: { path: app }'] : []),
    `environments:\n  demo: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

const AUTHORIZATION = {
  schemaVersion: 1,
  environment: { name: 'demo', baseUrl: BASE_URL, allowlist: ['localhost'] },
  checks: ['dependencies', 'secrets', 'configuration'],
  identities: [],
  prohibitedActions: ['brute force', 'denial of service', 'writing to the source checkout'],
  rateLimit: { requestsPerSecond: 10, maxRequests: 10 },
  createdAt: '2026-10-11T10:00:00Z',
};

async function createProject(projectRoot: string, withSource: boolean): Promise<EngineContext> {
  await mkdir(join(projectRoot, '.qa'), { recursive: true });
  await mkdir(join(projectRoot, 'security'), { recursive: true });
  await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(withSource));
  await writeFile(join(projectRoot, 'security', 'authorization.json'), JSON.stringify(AUTHORIZATION));
  await mkdir(join(projectRoot, 'app'), { recursive: true });
  await cp(join(DEMO_APP_DIRECTORY, 'src'), join(projectRoot, 'app', 'src'), { recursive: true });
  await cp(join(DEMO_APP_DIRECTORY, 'package.json'), join(projectRoot, 'app', 'package.json'));
  await writeFile(join(projectRoot, 'app', 'package-lock.json'), '{}');
  const processRunner: ProcessRunner = {
    run: () => Promise.resolve({ exitCode: 1, stdout: NPM_AUDIT_REPORT, stderr: '' }),
  };
  return {
    projectRoot,
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner,
    httpClient: fetchHttpClient,
    browserLauncher: playwrightBrowserLauncher,
    env: {},
  };
}

// The demo application's source carries the catalogued code-level weaknesses: the session cookie
// built without HttpOnly (BUG-012), a session secret with a literal fallback and sample credentials.
describe('code-assisted security audit (demo app source)', () => {
  it('reports the demo app source weaknesses with file and line references and sends no request', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot, true);
      await runSecurityAuthorizationAdd(engine, { path: 'security/authorization.json' });
      await runSecurityAuthorizationApprove(engine, { approvedBy: 'operator' });

      const { result, drafts, evidencePath } = await runSecurityAudit(engine, {
        checks: DEFAULT_SECURITY_CHECKS,
      });

      expect(result.requests).toEqual([]);
      expect(result.checks.map((entry) => [entry.checkClass, entry.status])).toEqual([
        ['dependencies', 'failed'],
        ['secrets', 'failed'],
        ['configuration', 'failed'],
      ]);
      const references = result.findings.flatMap((finding) => finding.codeReferences ?? []);
      expect(references).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'app/src/server.ts', line: expect.any(Number) as number }),
          expect.objectContaining({ path: 'app/src/routes/oauth.ts', line: expect.any(Number) as number }),
          expect.objectContaining({ path: 'app/src/data.ts', line: expect.any(Number) as number }),
          { path: 'app/package.json', line: expect.any(Number) as number },
        ]),
      );

      // BUG-012 as the code states it: the cookie option sits on the very line the finding cites.
      const cookie = result.findings.find((finding) =>
        finding.id.startsWith('configuration-cookie-http-only'),
      );
      const cited = cookie?.codeReferences?.[0];
      const serverLines = (await readFile(join(projectRoot, 'app', 'src', 'server.ts'), 'utf8')).split(
        /\r?\n/u,
      );
      expect(serverLines[(cited?.line ?? 0) - 1]).toContain('httpOnly: false');

      // The session secret literal is found, and the value never reaches the registered result.
      expect(result.findings.map((finding) => finding.id)).toEqual(
        expect.arrayContaining(['secrets-hardcoded-secret-app-src-server-ts', 'dependencies-express']),
      );
      const stored = await readFile(join(projectRoot, '.qa', ...evidencePath.split('/')), 'utf8');
      expect(stored).not.toContain('demo-app-session-secret');
      expect(drafts.find((draft) => draft.id === 'security-dependencies-express')).toMatchObject({
        category: 'security',
        securityCodeReferences: [{ path: 'app/package.json' }],
      });
    });
  }, 60_000);

  it('does not change the source checkout', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot, true);
      await runSecurityAuthorizationAdd(engine, { path: 'security/authorization.json' });
      await runSecurityAuthorizationApprove(engine, { approvedBy: 'operator' });
      const before = await nodeFileSystem.listFiles(join(projectRoot, 'app'));

      await runSecurityAudit(engine, { checks: DEFAULT_SECURITY_CHECKS });

      expect(await nodeFileSystem.listFiles(join(projectRoot, 'app'))).toEqual(before);
    });
  }, 60_000);

  it('degrades to black-box only, with every code-assisted check skipped, when source.path is absent', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot, false);
      await runSecurityAuthorizationAdd(engine, { path: 'security/authorization.json' });
      await runSecurityAuthorizationApprove(engine, { approvedBy: 'operator' });

      const { result, drafts } = await runSecurityAudit(engine, { checks: DEFAULT_SECURITY_CHECKS });

      expect(result.status).toBe('completed');
      expect(result.checks.every((entry) => entry.status === 'skipped')).toBe(true);
      expect(result.findings).toEqual([]);
      expect(drafts).toEqual([]);
    });
  }, 60_000);
});
