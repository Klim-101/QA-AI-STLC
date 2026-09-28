---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa.http_execute` no longer accepts a `tlsInsecure` input: certificate validation now follows the
resolved environment's `tlsInsecure` in `config.yaml`, the same as `qa.browser_open`. Previously a
caller could disable validation for any call to an allowlisted host, and an environment configured
with `tlsInsecure: true` was not honored for HTTP calls unless the caller repeated it. A warning is
logged when the environment disables validation. `runHttpExecute`'s `tlsInsecure` option is removed.
