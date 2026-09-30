# @qa-ai-stlc/runner-api

Implements the `Runner` interface (`@qa-ai-stlc/core`) for `api` test cases. Before any spec runs it
loads the OpenAPI 3.x contract `config.yaml` names in `api.source` (a project file, an allowlisted
URL, or `discover`), then checks every test case a spec declares through its `testCaseId`
annotation: the case must be an `api` case, must list the contract operations it exercises in
`endpoints`, and every one of them must exist in the contract. A case that names an operation the
contract lacks rejects the whole run (`API_CASE_NOT_IN_CONTRACT`) before a request is sent. The
contract text is stored as `artifacts/api-contract.txt` and registered in the manifest, so the
SHA-256 a run relied on is on record.

The specs themselves are ordinary Playwright Test files using `APIRequestContext`; execution and
result mapping reuse `@qa-ai-stlc/runner-playwright`.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
