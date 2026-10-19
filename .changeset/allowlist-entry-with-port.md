---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

An allowlist entry may now name a port (ADR-0019). `localhost:8091` admits that host on exactly that port; a bare `localhost` still admits it on the port of `baseUrl` only. Before, an application served from one port that read its data from an API on another (an interface on `:4200`, its API on `:8091`) was explored without its data, because every call to the API was blocked and no setting could allow it. List both entries, `[localhost, localhost:8091]`: a port entry does not admit the port of `baseUrl` on its own, and the scheme of `baseUrl` still applies to every entry. One function now decides for the browser, the HTTP tools, the runners and the explorer, and the explorer's crawl filter and the cookie check read the host of an entry. The explore report names the entry that would admit a blocked port (`host:port`). The operator adds a port entry in `config.yaml` or with `qa config add environment`; `qa.config_add` refuses one with `CONFIG_ALLOWLIST_PORT_NOT_SETTABLE`, and an entry that only the local layer adds is reported as a relaxation. An entry with a path or a scheme is still rejected.
