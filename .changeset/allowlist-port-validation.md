---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/explorer': patch
---

Fixes a silent failure mode found during a manual end-to-end eval (#329): `environments.<name>.allowlist`
entries were validated only as non-empty strings, so a plausible-looking but wrong value (a port or
scheme, e.g. `"localhost:4310"` instead of `"localhost"`) passed `qa config add environment` and
`config.yaml` validation, then made every `qa explore` crawl navigation fail the allowlist check —
since the check compares against `URL.hostname`, which is always port-stripped — with 0 elements and
no diagnostic, indistinguishable from "the app has nothing." `EnvironmentConfigSchema.allowlist`
(`packages/schemas`) now rejects an entry containing a scheme, port or path with a clear error
message. `qa explore` (`packages/explorer`) also now warns with a coded `EXPLORE_START_URL_NOT_ALLOWED`
message whenever a crawl visits 0 pages because the environment's own `baseUrl` fails its allowlist.
