---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
---

The agent-layer eval set. `EvalScenarioSchema` names the catalogued demo-app bugs a run is expected to find; `runEvalScore` scores a project against it from what the engine recorded: bugs detected, valid spoke responses (from the spoke I/O store), selector stability and spoke duration, with rates left `null` when there is nothing to divide by and tokens and cost listed as not measured. `npm run eval` runs a scripted baseline against the demo app, or with `--project <dir>` scores a project a real agent worked in, and writes the report as JSON and Markdown.
