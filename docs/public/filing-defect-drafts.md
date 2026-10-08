# Filing defect drafts with your own tooling

QA-AI-STLC stops at the defect draft. Creating the defect in Jira, GitHub Issues, Azure DevOps or any other tracker is yours: the framework has no tracker integration, stores no tracker credentials and sends nothing anywhere. This page shows how to bridge the gap with tools you already trust. The examples are illustrations, not supported integrations.

## What you get

An accepted draft is a JSON file at `artifacts/defects/<id>.json`, validated against the defect draft schema:

| Field                                                    | Meaning                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`, `title`                                            | Stable identifier and one-line summary                                                   |
| `severityProposal`                                       | `blocker`, `critical`, `major`, `minor` or `trivial`. A proposal, not a decision         |
| `category`                                               | `functional`, `ui`, `accessibility`, `api`, `performance` or `security`                  |
| `steps`, `expectedResult`, `actualResult`, `environment` | The reproduction, in plain text                                                          |
| `requirementIds`                                         | Scoped requirements the defect traces back to                                            |
| `evidencePaths`                                          | Project-relative paths of evidence the engine registered (screenshots, traces, API logs) |
| `status`                                                 | `draft`, `accepted` or `rejected`                                                        |

The field names carry no tracker vocabulary. Mapping them to your tracker's fields, workflow states and severity scale is your decision.

## Only file what you accepted

Acceptance is a gate, not a flag. `qa defect accept <id> --approved-by <name>` binds the approval to the draft's exact content, and `qa validate` reads a draft as `draft` again if the file was edited afterwards. Run it before filing, and have your script skip anything that is not `accepted`:

```sh
qa validate
qa defect accept login-error --approved-by "Your Name"
```

## Example: GitHub Issues with the `gh` CLI

```sh
id=login-error
draft="artifacts/defects/$id.json"

test "$(jq -r .status "$draft")" = accepted || { echo "not accepted"; exit 1; }

body=$(jq -r '
  "**Severity (proposed):** \(.severityProposal)\n**Category:** \(.category)\n**Environment:** \(.environment)\n\n" +
  "## Steps\n" + ([.steps | to_entries[] | "\(.key + 1). \(.value)"] | join("\n")) +
  "\n\n## Expected\n\(.expectedResult)\n\n## Actual\n\(.actualResult)\n\n" +
  "## Evidence\n" + ([.evidencePaths[] | "- `\(.)`"] | join("\n"))
' "$draft")

gh issue create --title "$(jq -r .title "$draft")" --body "$body"
```

`gh` authenticates with your own login. The framework never sees that token. Evidence files are paths inside your project; attach them with whatever your tracker supports.

## Example: any tracker with a small Node script

Trackers differ, so keep the mapping in a script you own and validate the input first. Read the draft as JSON, check `status`, then call your tracker's API with credentials from your environment:

```js
import { readFile } from 'node:fs/promises';

const draft = JSON.parse(await readFile('artifacts/defects/login-error.json', 'utf8'));
if (draft.status !== 'accepted') throw new Error('Draft is not accepted');

const response = await fetch(process.env.TRACKER_ISSUES_URL, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${process.env.TRACKER_TOKEN}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    title: draft.title,
    description: draft.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
  }),
});
if (!response.ok) throw new Error(`Tracker returned ${response.status}`);
```

`TRACKER_ISSUES_URL` and `TRACKER_TOKEN` belong to your environment or secret manager. Keep them out of the repository and out of `.qa/`.

## Responsibilities

- **Redaction.** Drafts are built from registered evidence, which the engine scans for secrets before registration. Review a draft before you send it to a shared system. Once published, you cannot take it back.
- **Duplicates and triage.** The framework does not know what your tracker already contains. Search before filing.
- **Status after filing.** Linking the tracker key back to the draft, closing the defect or re-testing it is tracked in your system. The framework does not read from it.
- **Reports.** Run reports from `qa report` follow the same rule: the engine renders them into your project, and publishing them (for example to a wiki) is yours.

See the [responsibility boundary](../../README.md#responsibility-boundary) for the full statement.
