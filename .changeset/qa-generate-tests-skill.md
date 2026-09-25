---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `qa-generate-tests` (P3-07): the skill that codifies a proven `qa-execute` session into a
deterministic Playwright/API spec, plus the engine support it needs.

`qa.browser_click`/`qa.browser_fill`/`qa.browser_navigate`/`qa.http_execute` accept an optional
`stepId` (`'step-<N>'`, `N` the case step's 1-based position), carried inside the evidence content
itself (`BrowserActionSchema`, new `HttpRequestRecordSchema`) rather than only on the `Evidence`
wrapper, which is never persisted on its own. New core operation `findLatestProvenSession` (and its
MCP wrapper `qa.generation_proven_session`) recovers a case's most recently proven session by
reading its latest passing `RunResult` and grouping the evidence it points to by `stepId` — no
separate session-log artifact. `GenerationSpokeInput` gains an optional `provenSession` field, so
`isGeneratedTestSpecStale` (P3-04) picks up a re-executed `qa-execute` session as drift for free.

`agents/skills/qa-execute` documents the `stepId` convention for every step-performing call;
`agents/skills/qa-generate-tests` is new.
