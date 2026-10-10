// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  runDefectAccept,
  runDefectAdd,
  runSecurityAuthorizationAdd,
  runSecurityAuthorizationApprove,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SECURITY_CHECKS } from '../src/default-checks.js';
import { runSecurityAudit } from '../src/security-audit.js';

// A port no other test uses (they sit in 4390..4421 and 4690).
const PORT = 4691;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: in-scope }',
  `environments:\n  demo: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities:',
  `  member: { auth: storage-state, secret: QA_DEMO_EMPLOYEE_PASSWORD, loginUrl: "${BASE_URL}login", username: employee@example.com }`,
  `  admin: { auth: storage-state, secret: QA_DEMO_ADMIN_PASSWORD, loginUrl: "${BASE_URL}login", username: admin@example.com }`,
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

const AUTHORIZATION = {
  schemaVersion: 1,
  environment: { name: 'demo', baseUrl: BASE_URL, allowlist: ['localhost'] },
  checks: ['headers', 'cookies', 'cors', 'csrf', 'authz', 'session', 'errors', 'encoding'],
  identities: [
    { name: 'member', role: 'low' },
    { name: 'admin', role: 'high' },
  ],
  prohibitedActions: ['brute force', 'denial of service', 'writes outside owned test records'],
  allowedMutations: [
    {
      method: 'POST',
      path: '/tasks',
      reason: 'Creates one task that carries the project owner marker',
      body: 'title=qa-ai-stlc+security+audit&priority=low&assignee=',
      contentType: 'application/x-www-form-urlencoded',
    },
    { method: 'POST', path: '/logout', reason: 'Ends the audit identity session' },
  ],
  restrictedRoutes: ['/admin/users'],
  logoutPath: '/logout',
  rateLimit: { requestsPerSecond: 50, maxRequests: 100 },
  createdAt: '2026-10-10T10:00:00Z',
};

async function createProject(projectRoot: string): Promise<EngineContext> {
  await mkdir(join(projectRoot, '.qa'), { recursive: true });
  await mkdir(join(projectRoot, 'security'), { recursive: true });
  await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML);
  await writeFile(join(projectRoot, 'security', 'authorization.json'), JSON.stringify(AUTHORIZATION));
  return {
    projectRoot,
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner: nodeProcessRunner,
    httpClient: fetchHttpClient,
    browserLauncher: playwrightBrowserLauncher,
    // The demo app's published sample credentials, passed the way a real secret would be.
    env: { ...process.env, QA_DEMO_EMPLOYEE_PASSWORD: 'employee123', QA_DEMO_ADMIN_PASSWORD: 'admin123' },
  };
}

// The whole path against the real demo application: authorize, approve, audit with the real HTTP
// client, register the evidence and hand a finding to the ordinary defect gate.
describe('security audit (demo app)', () => {
  it('refuses to start before the operator approved the authorization, and sends nothing', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot);
      await runSecurityAuthorizationAdd(engine, { path: 'security/authorization.json' });

      await expect(runSecurityAudit(engine, { checks: DEFAULT_SECURITY_CHECKS })).rejects.toMatchObject({
        code: 'SECURITY_NOT_AUTHORIZED',
      });
    });
  }, 60_000);

  it('audits the demo app, keeps every request on its origin and files a finding as a defect draft', async () => {
    await withTempDir(async (projectRoot) => {
      const engine = await createProject(projectRoot);
      await runSecurityAuthorizationAdd(engine, { path: 'security/authorization.json' });
      await runSecurityAuthorizationApprove(engine, { approvedBy: 'operator' });

      const { result, drafts, evidencePath } = await runSecurityAudit(engine, {
        checks: DEFAULT_SECURITY_CHECKS,
      });

      const statusOf = (checkClass: string) =>
        result.checks.find((entry) => entry.checkClass === checkClass)?.status;
      const findingIds = result.findings.map((finding) => finding.id);

      // The catalogued security bugs: BUG-005 (any signed-in user opens the admin list), BUG-010
      // (the anti-forgery token is never verified) and BUG-012 (the session cookie lacks HttpOnly).
      expect(findingIds).toEqual(
        expect.arrayContaining([
          'authz-admin-users-low-privilege',
          'csrf-post-tasks',
          'cookies-connect-sid-httponly',
        ]),
      );
      expect(findingIds).not.toContain('authz-admin-users-anonymous');
      expect(statusOf('authz')).toBe('failed');
      expect(statusOf('csrf')).toBe('failed');
      expect(statusOf('cookies')).toBe('failed');
      expect(statusOf('headers')).toBe('failed');
      expect(statusOf('cors')).toBe('passed');
      expect(statusOf('encoding')).toBe('uncertain');
      // The demo app does end the session on sign-out, so this check has nothing to report.
      expect(statusOf('session')).toBe('passed');
      expect(findingIds).toEqual(
        expect.arrayContaining(['headers-content-security-policy', 'headers-technology-banner']),
      );

      // Zero requests outside the allowlist: everything the audit sent stayed on the demo origin.
      expect(result.requests.length).toBeGreaterThan(5);
      expect(
        result.requests.every((entry) => entry.outcome === 'sent' && entry.url.startsWith(BASE_URL)),
      ).toBe(true);

      // The result is registered, secret-scanned evidence, and each finding became a draft that cites it.
      const stored = JSON.parse(
        await readFile(join(projectRoot, '.qa', ...evidencePath.split('/')), 'utf8'),
      ) as {
        auditId: string;
      };
      expect(stored.auditId).toBe(result.auditId);
      expect(drafts).toHaveLength(result.findings.length);
      const draft = drafts.find((candidate) => candidate.id === 'security-authz-admin-users-low-privilege');
      expect(draft).toMatchObject({
        category: 'security',
        status: 'draft',
        severityProposal: 'critical',
        evidencePaths: [evidencePath],
      });

      // The draft goes through the ordinary defect gate unchanged.
      await mkdir(join(projectRoot, 'defects'), { recursive: true });
      await writeFile(join(projectRoot, 'defects', 'authz.json'), JSON.stringify(draft));
      await expect(runDefectAdd(engine, { path: 'defects/authz.json' })).resolves.toMatchObject({
        id: 'security-authz-admin-users-low-privilege',
      });
      await expect(
        runDefectAccept(engine, { id: 'security-authz-admin-users-low-privilege', approvedBy: 'operator' }),
      ).resolves.toMatchObject({ status: 'accepted' });
    });
  }, 120_000);
});
