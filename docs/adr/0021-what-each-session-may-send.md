# ADR-0021: What each kind of session may send

Status: Accepted
Date: 2026-10-21

## Context

Safe mode and the domain allowlist (AGENTS.md 12.4) were decided in pieces. ADR-0005 says the agent drives the browser only through engine tools. ADR-0009, ADR-0014, ADR-0015, ADR-0017, ADR-0018 and ADR-0019 each changed what some kind of session may do, and each states its change as "the guarantee goes from X to Y". To learn what a given session can send, a reader has to apply all of them in order, and a decision that touches one kind of session can quietly contradict the rule for another. Reviewing the ADRs found two such cases: the scripted sign-in was described as running under safe mode, which it never did, and an execution session could be opened by any caller for any case.

This record states the result once. It decides nothing new and links to the ADR that owns each cell.

## Decision

Two rules hold for every session in the table, and no session widens them:

1. **The allowlist is unconditional.** Every request a session makes must pass the environment's allowlist: host, port (ADR-0019) and the scheme of `baseUrl`.
2. **Only the operator widens a boundary.** The allowlist, `safeNonGetRequests` and the use of a port entry are set in `config.yaml` or the local layer. No MCP tool can add them, and an entry that only the local layer adds is reported as a relaxation (ADR-0011, ADR-0014, ADR-0019).

What each kind of session may send beyond that:

| Session                                           | Methods that go out                                                                      | Actions                                                                                                                                                     | Chosen by                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Crawl, page analysis, locator scoring, `--verify` | Safe methods (ADR-0018) and the `POST` paths in `safeNonGetRequests` (ADR-0014)          | None. Pages are loaded and read.                                                                                                                            | Always                                                   |
| The same, with `--probe-navigation`               | As above                                                                                 | Clicks one navigation control per fresh context, outside forms, then discards it (ADR-0015)                                                                 | The caller, per run                                      |
| The same, with `--expand-collapsed`               | As above                                                                                 | Opens collapsed panels in contexts that are discarded (ADR-0017)                                                                                            | The caller, per run                                      |
| Pick mode (CLI only)                              | As the crawl                                                                             | A person clicks in a headed window                                                                                                                          | The person at the keyboard                               |
| `qa.browser_open`, `qa.browser_attach`            | As the crawl                                                                             | Engine tools only, each registered as evidence (ADR-0004, ADR-0005, ADR-0013); an attached browser is limited to one page on a loopback endpoint (ADR-0012) | The agent                                                |
| The same, with `caseId`                           | Any method                                                                               | As above                                                                                                                                                    | The agent, for a case of an approved case set (ADR-0009) |
| Scripted sign-in                                  | The login form is submitted                                                              | Fills and submits the form of the identity's `loginUrl`, which must pass the allowlist (ADR-0012)                                                           | Configuration                                            |
| `qa.http_execute`                                 | Safe methods; any other with `caseId` (ADR-0009)                                         | One request; credentials come from a profile, never from the caller (ADR-0012)                                                                              | The agent                                                |
| The API runner                                    | Whatever the spec does                                                                   | The runner executes the registered spec as written                                                                                                          | The operator                                             |
| Security audit                                    | Safe methods, and any other only when the authorization names that exact method and path | Rate- and budget-limited probes; no redirects followed                                                                                                      | An explicit authorization recorded as a gate             |
| `qa run` of a generated spec                      | Whatever the spec does                                                                   | The runner executes the registered spec as written; safe mode is not installed                                                                              | The operator                                             |

A request that safe mode blocks is reported by method and path, with the reason (ADR-0014, ADR-0019), so an operator can tell a missing configuration entry from a defect.

The single definition of a safe method is `SAFE_HTTP_METHODS` in `@qa-ai-stlc/core` (ADR-0018).

A change to any cell of the table is a change to a decision: it needs its own ADR, or an amendment of the ADR that owns the cell, and an edit to this table in the same change.

## Consequences

The question "can this session change the application under test" has one place to be answered, and a new kind of session has to add a row. The table also shows what is not guarded: generated specs, whether they drive a browser or the API, send what they are written to send, and what protects them is the review of the case and the spec, not safe mode.

The cost is a second place that repeats facts which ADRs own. It is kept short and links to them so that a stale cell is easy to see.

Rejected: restating the matrix in AGENTS.md 12.4 only. That file already carries the prose, and it is not versioned by decision. Also rejected: folding the earlier ADRs into one and marking them superseded, which would lose the reasoning each of them records.
