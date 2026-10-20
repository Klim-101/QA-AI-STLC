// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { EngineContext } from '../engine-context.js';
import { CASES_INDEX_PATH } from '../gate.js';
import { hashText } from '../hash.js';
import { runApprove } from '../operations/approve.js';
import { runCasesAdd } from '../operations/cases-add.js';

const SCOPE_JSON = JSON.stringify({
  generatedAt: '2026-09-20T12:00:00Z',
  requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
});

export interface SeedCaseOptions {
  readonly id?: string;
  /** Leaves the `cases` gate open, as a project whose operator has not reviewed the case set yet. */
  readonly skipCasesApproval?: boolean;
}

/**
 * Registers one e2e case in a fake project and approves the `scope` and `cases` gates through the
 * real operations, so a test sees exactly the state an operator's approval leaves behind. Rewrites
 * the config so the testing scope is decided, which `qa cases add` requires.
 */
export async function seedApprovedCase(
  context: EngineContext,
  options: SeedCaseOptions = {},
): Promise<string> {
  const id = options.id ?? 'login-valid-credentials';
  const qaDir = join(context.projectRoot, '.qa');
  const configPath = join(qaDir, 'config.yaml');
  const config = await context.fs.readFile(configPath);
  await context.fs.writeFile(
    configPath,
    config.replace(
      /testing: \{[^}]*\}/,
      'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
    ),
  );
  await context.fs.mkdir(join(qaDir, 'artifacts'));
  await context.fs.writeFile(join(qaDir, 'artifacts', 'scope.json'), SCOPE_JSON);
  await context.fs.writeFile(
    join(qaDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      artifacts: {
        'artifacts/scope.json': {
          sha256: hashText(SCOPE_JSON),
          mode: 'text',
          registeredAt: '2026-09-20T12:00:00Z',
        },
      },
    }),
  );
  await runApprove(context, { gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
  await runCasesAdd(context, {
    testCase: {
      id,
      feature: 'login',
      requirementIds: ['r1'],
      testType: 'e2e',
      title: 'A registered user can log in',
      steps: [{ description: 'Submit valid credentials' }],
      expectedResult: 'The dashboard loads',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    },
  });
  if (options.skipCasesApproval !== true) {
    await runApprove(context, { gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' });
  }
  return id;
}
