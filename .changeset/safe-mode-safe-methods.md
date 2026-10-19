---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/runner-security': patch
---

Safe mode now lets the safe HTTP methods through, not only `GET`: `GET`, `HEAD`, `OPTIONS` and `QUERY` (ADR-0018). An application that reads with `QUERY` (a read whose parameters travel in a request body, as a product search or a category tree often does) used to load nothing during exploration, because safe mode aborted every `QUERY` request as a mutation and `safeNonGetRequests` accepts `POST` only. The comparison is exact and case-sensitive, `TRACE` stays blocked, and every other method (`POST`, `PUT`, `PATCH`, `DELETE`) is aborted as before. The domain allowlist still applies to every request. The browser safe-mode handler and the security probe now share one definition of a safe method (`SAFE_HTTP_METHODS` in `@qa-ai-stlc/core`), so the two can no longer disagree; the security probe now also sends a `QUERY` request without an authorization entry. A `QUERY` request that goes through is not yet recorded as an endpoint in `endpoints.json` or compared with the OpenAPI contract, which do not know the method.
