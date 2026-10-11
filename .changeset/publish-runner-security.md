---
'@qa-ai-stlc/runner-security': patch
---

Publish `@qa-ai-stlc/runner-security` with the other engine packages. It was marked private, which made every changeset that names it together with a published package invalid ("mixed changeset") and kept its exact dependency pins out of step with the versions the release bumps.
