// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// `npm run eval` (P4-07): the agent-layer eval set. Runs the scripted baseline of a scenario against
// the demo app, or, with `--project <dir>`, takes a project a real agent worked in, and scores what
// the engine recorded: catalogued bugs found, valid spoke responses, selector stability and spoke
// duration. Writes `<out>/<scenario>.json` and `.md` and prints the Markdown. With `--compare` (P4-08)
// it runs the baseline once sequentially and once in parallel and sets the two side by side. It calls
// no model.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHttpClient,
  noopLogger,
  nodeFileSystem,
  nodeProcessRunner,
  playwrightBrowserLauncher,
  renderEvalReportMarkdown,
  runEvalScore,
  runRunMetrics,
  systemClock,
} from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import { runBaseline } from './lib/eval-baseline.mjs';
import { parseEvalArgs } from './lib/eval-args.mjs';
import { buildComparison, renderComparisonMarkdown } from './lib/eval-comparison.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_RUN_ID = 'eval-baseline';

function engineContext(projectRoot) {
  return {
    projectRoot,
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner: nodeProcessRunner,
    httpClient: fetchHttpClient,
    browserLauncher: playwrightBrowserLauncher,
    env: process.env,
  };
}

async function writeReport(outputDirectory, name, data, markdown) {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(join(outputDirectory, `${name}.md`), markdown);
}

async function compare(options, scenario) {
  const demoApp = await startDemoApp(options.port);
  const runs = [];
  try {
    for (const [label, parallelism] of [
      ['sequential', 1],
      ['parallel', options.parallelism],
    ]) {
      const projectRoot = join(repoRoot, '.eval-scratch', label);
      await runBaseline({ projectRoot, baseUrl: `http://localhost:${String(options.port)}/`, parallelism });
      const context = engineContext(projectRoot);
      runs.push({
        label,
        parallelism,
        report: await runEvalScore(context, { scenario }),
        metrics: await runRunMetrics(context, { runId: BASELINE_RUN_ID }),
      });
    }
  } finally {
    await demoApp.stop();
  }
  const comparison = buildComparison(scenario.id, runs);
  const markdown = renderComparisonMarkdown(comparison);
  await writeReport(options.outputDirectory, `${scenario.id}-comparison`, comparison, markdown);
  process.stdout.write(
    `${markdown}\nWrote ${join(options.outputDirectory, `${scenario.id}-comparison`)}.{json,md}\n`,
  );
}

async function main() {
  const options = parseEvalArgs(process.argv.slice(2), repoRoot);
  const scenario = JSON.parse(await readFile(options.scenarioPath, 'utf-8'));
  if (options.isComparison) {
    await compare(options, scenario);
    return;
  }
  let projectRoot = options.projectDirectory;

  if (projectRoot === undefined) {
    projectRoot = join(repoRoot, '.eval-scratch');
    const demoApp = await startDemoApp(options.port);
    try {
      await runBaseline({
        projectRoot,
        baseUrl: `http://localhost:${String(options.port)}/`,
        parallelism: options.parallelism,
      });
    } finally {
      await demoApp.stop();
    }
  }

  const report = await runEvalScore(engineContext(projectRoot), { scenario });
  const markdown = renderEvalReportMarkdown(report);
  await writeReport(options.outputDirectory, report.scenarioId, report, markdown);
  process.stdout.write(`${markdown}\nWrote ${join(options.outputDirectory, report.scenarioId)}.{json,md}\n`);
}

main().catch((error) => {
  process.stderr.write(`eval failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
