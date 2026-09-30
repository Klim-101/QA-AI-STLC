# @qa-ai-stlc/explorer

The crawler: route discovery from a start URL, following only in-allowlist links, in safe mode.
Every non-GET request is intercepted and cancelled before it reaches the network, so a crawl can
never mutate the application under test. Produces a `RouteMap` and a redactable HAR-shaped
request log for the engine to register as evidence. It also derives the application's observed API
surface and diffs it against an OpenAPI 3.x contract (a file, an allowlisted URL, or one discovered
by probing well-known paths with GET requests), classifying each discrepancy.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
