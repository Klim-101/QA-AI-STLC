// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// `npm run eval` (P4-07): the agent-layer eval set. Runs the scripted baseline of a scenario against
// the demo app, or, with `--project <dir>`, takes a project a real agent worked in, and scores what
// the engine recorded: catalogued bugs found, valid spoke responses, selector stability and spoke
// duration. Writes `<out>/<scenario>.json` and `.md` and prints the Markdown. It calls no model.
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
  systemClock,
} from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import { runBaseline } from './lib/eval-baseline.mjs';
import { parseEvalArgs } from './lib/eval-args.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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

async function main() {
  const options = parseEvalArgs(process.argv.slice(2), repoRoot);
  const scenario = JSON.parse(await readFile(options.scenarioPath, 'utf-8'));
  let projectRoot = options.projectDirectory;

  if (projectRoot === undefined) {
    projectRoot = join(repoRoot, '.eval-scratch');
    const demoApp = await startDemoApp(options.port);
    try {
      await runBaseline({ projectRoot, baseUrl: `http://localhost:${String(options.port)}/` });
    } finally {
      await demoApp.stop();
    }
  }

  const report = await runEvalScore(engineContext(projectRoot), { scenario });
  await mkdir(options.outputDirectory, { recursive: true });
  const markdown = renderEvalReportMarkdown(report);
  await writeFile(
    join(options.outputDirectory, `${report.scenarioId}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(join(options.outputDirectory, `${report.scenarioId}.md`), markdown);
  process.stdout.write(`${markdown}\nWrote ${join(options.outputDirectory, report.scenarioId)}.{json,md}\n`);
}

main().catch((error) => {
  process.stderr.write(`eval failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
