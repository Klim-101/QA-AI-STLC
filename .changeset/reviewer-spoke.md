---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

The reviewer spoke. `qa.review_input` gives it a registered spec, its case, the verification that let it be registered and, for each `expect(...)`, what the engine found: `tautology` (the assertion is about a literal, so it holds whatever the application does), `inline-locator`, `unknown-locator` and `ungrounded-value` (an expected value neither the case nor its proven session contains). The author's reasoning is not part of it. `qa.review_add` (also `qa review add --path`) registers the verdict under `artifacts/reviews/<case-id>.json`, bound to the spec's exact content; the engine refuses an approval with an error finding (`REVIEW_APPROVAL_BLOCKED`), a warning with no reasoned waiver (`REVIEW_WARNING_NOT_WAIVED`) and a waiver for a finding it does not raise. `reviewer` joins the spoke definitions (contract and generated `qa-reviewer` subagent, `agents.models.reviewer`).
