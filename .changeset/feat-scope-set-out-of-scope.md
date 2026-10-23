---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Let the operator take a requirement out of scope. `qa scope set <in-scope|out-of-scope> <requirement-id>...` and the `qa.scope_set` tool move requirements in or out of `artifacts/scope.json`; the scope gate's hash covers the change, so an approved gate reopens. Out-of-scope requirements are left out of the traceability matrix and its coverage counts. `qa scope` no longer resets a requirement's scope decision when it reads the source again, and it reports requirements whose section left the source but that are still in scope as `orphaned`. The `qa-start`, `qa-design-cases` and scope-phase guidance describe the new step.
