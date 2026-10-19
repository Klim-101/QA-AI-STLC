---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

Exploring a second environment no longer disturbs the first one's elements (ADR-0020). The project has one selector registry and one API surface however many environments it lists, and a crawl of the second used to report the first environment's elements as `removed` and to mark them deprecated, which also made `--verify` skip them. A registry element and an endpoint now name their environment (an optional field, so existing files stay valid and need no migration). A run replaces, deprecates, renames, verifies and counts only the elements of its own environment, leaves the others as they were, and says how many it left (`otherEnvironmentElementCount`, and a line in the explore summary). An element stored without an environment is read as belonging to the environment whose address rules admit its page, or to every environment when it has no page, and is claimed as it is explored again. No name of an element left alone is given to a new one, so the single locator module keeps unique function names. Generation and generated-spec verification offer only the elements of the spec's environment, `qa api-diff` compares the contract with the endpoints of its environment, and an element registered from a browser session is recorded under the session's environment. A call to `qa.generation_spoke_input` for an `e2e` case now has to name the environment when the project has more than one, as it already did for an `api` case.
