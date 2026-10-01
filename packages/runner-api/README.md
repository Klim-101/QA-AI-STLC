# @qa-ai-stlc/runner-api

Implements the `Runner` interface (`@qa-ai-stlc/core`) for `api` test cases. Before any spec runs it
loads the OpenAPI 3.x contract `config.yaml` names in `api.source` (a project file, an allowlisted
URL, or `discover`), then checks every test case a spec declares through its `testCaseId`
annotation: the case must be an `api` case, must list the contract operations it exercises in
`endpoints`, and every one of them must exist in the contract. A case that names an operation the
contract lacks rejects the whole run (`API_CASE_NOT_IN_CONTRACT`) before a request is sent. The
contract text is stored as `artifacts/api-contract.txt` and registered in the manifest, so the
SHA-256 a run relied on is on record.

A spec authenticates only through an `apiAuth` profile from `config.yaml` (ADR-0012): it imports the
generated `tests/qa/api-auth.ts` and calls `request.get(url, apiAuth('<profile>'))`. The runner resolves
the profiles a spec names, passes them to the Playwright process through its environment only, and
scrubs their values from reported failures. A spec that writes a credential itself is rejected before
it runs (`HTTP_CREDENTIAL_INPUT_REJECTED`), and a run that carries a credential keeps no Playwright
trace, since a trace archive holds request headers.

The specs themselves are ordinary Playwright Test files using `APIRequestContext`; execution and
result mapping reuse `@qa-ai-stlc/runner-playwright`.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
