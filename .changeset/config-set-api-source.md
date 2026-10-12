---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

API testing can be turned on after `qa init`: `qa config set testing.api in-scope --api-source <file, URL, discover or synthesize>` (and `apiSource` on `qa.config_set`) writes the `api` section with the scope change. Without a source the call fails with `CONFIG_SET_API_SOURCE_REQUIRED` and says how to give one. Switching `testing.api` off again keeps the `api` section.
