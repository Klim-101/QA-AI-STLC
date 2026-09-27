---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa-generate-tests`'s generation-contract and verification-loop engine support (P3-06/P3-07) is now
reachable through MCP, not only as internal `@qa-ai-stlc/core` library functions an agent has no way
to call: new `qa.generation_spoke_input` (assembles a spoke task's input from a registered case, a
registry slice and the locator module's real `GENERATOR_VERSION` stamp), `qa.generation_verify`
(typechecks and executes a candidate spec once, against a scratch copy, cross-checking coverage
against the case's own canonical steps), `qa.generation_register` (writes and registers only a
`'verified'` outcome, content-hash bound), and `qa.generation_manual_regions_extract`/`_apply`
(deterministic `// qa:manual` region splicing, so hand-written additions survive regeneration). New
`@qa-ai-stlc/core` operation `runBuildGenerationSpokeInput`. Proven end to end against the demo app
in CI, with no model call, standing in for what a real spoke would produce.
