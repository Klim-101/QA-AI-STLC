// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';
import { afterAll, describe, expect, it } from 'vitest';

const PORT = 4697;
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = mkdtempSync(join(tmpdir(), 'qa-ai-stlc-eval-'));

function runEval(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(REPO_ROOT, 'scripts', 'eval.mjs'), ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(join(REPO_ROOT, '.eval-scratch'), { recursive: true, force: true });
});

// The scripted baseline against the real demo app, then the same project scored again the way a
// project from a real agent would be. No model anywhere.
describe('npm run eval', () => {
  it('runs the baseline, writes a metrics report, and scores an existing project the same way', async () => {
    const baseline = await runEval(['--out', join(OUT, 'baseline'), '--port', String(PORT)]);

    expect(baseline.stderr).toBe('');
    expect(baseline.code).toBe(0);
    expect(baseline.stdout).toContain('# Eval report: baseline-demo-app');
    const report = JSON.parse(readFileSync(join(OUT, 'baseline', 'baseline-demo-app.json'), 'utf-8'));
    expect(report.bugs.results).toEqual([
      { bugId: 'BUG-001', isDetected: true, evidence: 'task-empty-title' },
      { bugId: 'BUG-002', isDetected: true, evidence: 'task-status-filter' },
      { bugId: 'BUG-004', isDetected: true, evidence: 'task-delete' },
      { bugId: 'BUG-007', isDetected: true, evidence: 'dashboard-greeting' },
      { bugId: 'BUG-008', isDetected: false },
    ]);
    expect(report.spokes).toMatchObject({ attempts: 7, okResponses: 7, validResponseRate: 1 });
    expect(report.selectors.elementCount).toBeGreaterThan(0);
    expect(report.duration.spokeSpanMs).toBeGreaterThan(0);
    expect(report.notMeasured).toEqual(['tokens', 'cost']);

    const rescored = await runEval([
      '--project',
      join(REPO_ROOT, '.eval-scratch'),
      '--out',
      join(OUT, 'rescored'),
    ]);

    expect(rescored.code).toBe(0);
    const again = JSON.parse(readFileSync(join(OUT, 'rescored', 'baseline-demo-app.json'), 'utf-8'));
    expect(again.bugs).toEqual(report.bugs);
    expect(again.spokes).toEqual(report.spokes);
  }, 240_000);

  it('fails with the reason on a bad argument', async () => {
    const failed = await runEval(['--port', 'nope']);

    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain('eval failed: --port must be a port number');
  }, 60_000);
});
