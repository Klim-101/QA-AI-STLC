# @qa-ai-stlc/schemas

Zod schemas for every QA-AI-STLC artifact under `.qa/`: config, scope, test case, run result,
evidence, defect draft, RCA, selector registry, API surface, approval ledger and manifest. This is
the versioned contract between the agent layer and the engine — every other package derives its
types from `z.infer` here rather than declaring a parallel interface.

Each schema also has a generated JSON Schema counterpart under `dist/json-schema/`, built with
`npm run build`, for consumers outside TypeScript.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
