# ADR-0019: An allowlist entry may name a port

Status: Accepted
Date: 2026-10-19

## Context

An environment's allowlist (AGENTS.md 12.4, ADR-0005) names the hosts the engine may reach. A request
is admitted when its host is listed, its scheme is the scheme of the environment's `baseUrl` and
its port is the port of `baseUrl` (#306). An entry is a bare host name; one with a port was rejected
on purpose (#329), because it matched nothing and failed silently.

That rule cannot express an application that is served from one port and reads its data from an API
on another, which is how most development setups run: an interface on `:4200`, its API on `:8091`.
Safe mode aborted every call to the API, so exploration saw pages without their data. A real run
aborted 163 plain `GET`s this way and built a registry from empty screens. There is no setting that
helps: the allowlist cannot name the second port, and `safeNonGetRequests` is about methods.

The rule is also not in one place. The browser and HTTP paths share `isUrlAllowed` and
`assertUrlAllowed`; the explorer's crawl has its own host-only pre-filter (`isAllowedUrl`); and the
check that a cookie belongs to an allowed host (`isCookieDomainAllowed`) reads the list by itself.
A change to what an entry means has to reach all of them.

## Decision

An allowlist entry is a host name, or a host name with a port: `localhost` or `localhost:8091`.

- A bare host name admits that host on the port of `baseUrl`, as before.
- `host:port` admits that host on exactly that port. It does not admit any other port of the host,
  and it does not by itself admit the port of `baseUrl`: the application's own entry stays in the
  list. To reach both, list both: `[localhost, localhost:8091]`.
- The scheme of `baseUrl` always applies, to every entry. An API on another scheme is not admitted.
- Everything else about the check is unchanged: the host is compared exactly, an unparseable URL
  admits nothing, and the check still decides for every request a session or an exploration makes.

One function decides: `findAllowlistMismatch` in `@qa-ai-stlc/core` reads each entry through
`parseAllowlistEntry`, and `isUrlAllowed` and `assertUrlAllowed` are both defined through it.
The explorer's pre-filter and the cookie check read only the host of an entry, through
`allowlistHostnames`: a crawl link and a cookie are not scoped to a port, and the request itself is
still held to the port by the safe-mode handler.

Adding a port is a boundary decision, so it follows `safeNonGetRequests` (ADR-0014):

- It lives in `config.yaml`. A port entry that only the local layer adds is reported as a
  relaxation on every command, as any other widened allowlist entry is.
- No MCP tool can add one. `qa.config_add` refuses an entry with a port with
  `CONFIG_ALLOWLIST_PORT_NOT_SETTABLE` and says the operator adds it; `qa config add environment`
  in a terminal accepts it.
- A blocked request now says why (ADR-0018 and the block reasons of the explore report), and for a
  port it names the entry that would admit it.

## Consequences

An application with its API on a second port can be explored and driven: the operator adds one entry
per port. The guarantee of the allowlist stays "nothing outside the listed host-and-port pairs", and
it stays checked in one place.

An entry costs the operator one line and is visible in the committed configuration, which is the
point: a second port is a second service, and the engine will now send it requests.

Rejected:

- A separate `apiBaseUrl` per environment. It adds a second URL concept that every consumer would
  have to learn, still cannot express more than one extra service, and does not remove the need to
  decide what the allowlist means for it.
- Admitting every port of an allowlisted host. It would let a session reach any other service on
  `localhost`, a database console or a debug server among them, and a bare host name has meant
  one port since #306.
- Letting an agent add a port. It widens where the engine may send requests, which is the operator's
  decision, as `safeNonGetRequests` is.

Not covered: an API on another scheme (an interface on `http` with an API on `https`), an IPv6
literal (a host name is still a plain DNS name), and a wildcard port.
