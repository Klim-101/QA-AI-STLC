---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
---

`agents.models` in `.qa/config.yaml` routes each spoke (`explorer`, `test-design`, `case-execution`, `test-generation`, `qa-rca`) to a model, and `qa agents generate` writes one Claude Code subagent per spoke into `.claude/agents/`, each with that `model:` (`inherit` when none is set). It rewrites only files it generated and refuses a file of the same name it did not (`AGENTS_FILE_NOT_GENERATED`). The explorer, test-design, case-execution and test-generation spokes get contract files in `agents/hub/spokes/`, next to `qa-rca`. Hosts whose subagents take no model ignore the setting.
