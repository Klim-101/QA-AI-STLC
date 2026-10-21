# ADR-0020: Registry elements name their environment

Status: Accepted
Date: 2026-10-19

## Context

A project has one selector registry (`selectors/registry.json`), one API surface
(`selectors/endpoints.json`) and one generated locator module, however many environments its
configuration lists. Exploring a second environment merged its elements into the first one's
registry, and it did so wrongly in two ways. A run reported the first environment's 297 elements as
`removed` although all 297 stayed in the file. And the merge deprecated them: an element the crawl
did not find is kept with `deprecatedAt` set, so exploring a second application marked the first
one's elements deprecated, and `--verify` of the first, which checks only elements that are not
deprecated, then skipped them.

Everything that reads the registry has the same blind spot. Generation offered a spoke the elements
of every environment, verification looked up an expectation in all of them, and `--verify` opened
the pages of other environments with a browser whose safe mode then refused them.

An element id was a hash of the full page address, origin included, so elements of two
environments on different origins never collided. That also made it depend on the machine: a local
layer that serves the same environment on another port (ADR-0011) gave every element another id, and
the ids reach the committed registry, the comments of the locator module and the input hash of
generation. What is missing is a record of which environment an element belongs to, and an id that
does not change with the port.

## Decision

An element of the registry, and an endpoint of the API surface, may name its environment:
`environment`, an optional field. It is additive: a file written before it exists stays valid, and
no schema version is bumped.

An item that names no environment belongs to the environment whose address rules (`baseUrl` and
allowlist, the rule the browser applies) admit its page, and an item with no page, such as an
element found in the source or an endpoint, belongs to every environment. One function,
`isInEnvironment` in `@qa-ai-stlc/core`, decides this for every consumer.

- **Writing.** An element the crawl found, or an element picked or registered from a session, is
  recorded as its environment's. An endpoint a crawl showed is too, also on the very first crawl, so
  that it is not claimed by the next environment. An old element is claimed one at a time, as its
  environment explores it again; until then it is read as above.
- **Exploring.** A run replaces, deprecates, renames and counts only the elements of its own
  environment, and leaves the rest as they were. No name of an element left alone is given to a new
  one, so the single locator module never gets two functions with one name. The report counts its own
  environment, and says how many elements of others it left (`otherEnvironmentElementCount`).
- **Reading.** `--verify` checks only the elements of its environment. Generation (the elements
  offered to the spoke, and the expectations resolved against them) and verification read the registry
  through `readRegistryForEnvironment`, which returns one environment's elements. `qa api-diff`
  compares the contract with the endpoints of its environment. Several environments and none named is
  an error, as it already is for the other operations that act on one.
- **Ids.** An element id hashes the environment's name and the page's path, query and fragment
  instead of its address, when the page is on the origin of the environment's `baseUrl`
  (`pageKeyInEnvironment`). The name is in the committed configuration, so it is the same on every
  machine and two environments with one path still get two ids. A page on any other origin keeps its
  whole address. `elementId` stays a string, so no schema changes. An id is migrated when its
  environment is explored again (`migrateElementIds`): an element the crawl or pick mode finds under
  its old id is re-keyed before the merge, with its name and history, and one registered from a
  session is re-keyed by recomputing its old id from what it stores. A registered element whose id is
  taken is left as it is. Locator modules and generation stamps change once, at that run.
- **Not split.** The locator module and the missing-test-id report stay project-wide: a spec is
  generated for a case, not for an environment, and imports a function by name. They list every
  environment's elements, and names stay unique across all of them.

## Consequences

Exploring one environment is safe for the others, and what an operation reads is what its
environment has. An existing registry needs no migration: it keeps working and is claimed as it is
explored. Two edge cases are accepted. An old element that two environments both admit by address
(the same host and port under two names) is read as belonging to both until one explores it, and an
old endpoint, which has a path and no origin, is claimed by whichever environment explores next.
Elements already deprecated by an earlier cross-environment crawl come back when their environment is
explored again, because a crawl that finds an element un-deprecates it.

A generation call for an `e2e` case in a project with several environments now has to name the
environment, as one for an `api` case already had to. `qa.generation_spoke_input` and the
`qa-generate-tests` skill say so.

Rejected: a directory per environment (`selectors/<environment>/`). It changes the paths that the
skills read directly and that generated specs and the manifest refer to, needs the one locator module
split or duplicated, and moves files in a migration, for no gain over a field the readers filter on.
Also rejected: leaving the registry as one list and only fixing the count in the report, which would
leave the deprecation and every reader as they are.

Not covered: `selectors/api-diff.json` is the report of the last run and is not kept per
environment, and the missing-test-id report is project-wide. A change to the registry schema that
would make the environment required is not made. Two pages of one environment on different origins
with the same path keep their addresses, so only the base origin is port-independent.
