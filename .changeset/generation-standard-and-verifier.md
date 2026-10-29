---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-playwright': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.generation_verify` rejects a spec that writes the environment's origin as a literal (`core.verification.literal_origin`, with a remediation: navigate and assert with paths), before anything runs. When a browser spec's `[expected-result]` step ran no web-first assertion, the result now says so and names a fix (`await expect(rows).toHaveCount(rowsBefore)`), and the verification issues carry that message instead of only the step id. The generation standard states both rules and forbids asserting on counts other specs change; `qa-generate-tests` runs the registered set together once before it reports generation done.
