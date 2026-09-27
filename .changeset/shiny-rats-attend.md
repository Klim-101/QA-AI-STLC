---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa explore` / `qa.explore` now derives a discovered API surface from the crawl's own traffic and
writes it to `.qa/selectors/endpoints.json`, merging with anything already stored there: every
request is redacted, then collapsed onto a templated path (`/tasks/8213`, `/tasks/t-1` →
`/tasks/{id}`) with a capped sample of the raw paths it was collapsed from. `qa.explore`'s result
gains `endpointsPath` and `endpointCount`. `ApiEndpointSchema` (`@qa-ai-stlc/schemas`) gains an
optional `examples` field to hold that sample.
