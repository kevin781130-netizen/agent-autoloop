# Vera task bridge contract v1 (staged, NOT ACTIVATED)

Pure data contract only. Implementation: plugins/vera-readonly/task-contract.ts.
Tests: tests/vera-task-contract.test.ts.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Cron, external events, retry queue | Agent Autoloop |
| Trusted rule to repo / worker mapping | Agent Autoloop trusted rules |
| Agent, model, isolated workspace, execution permissions | Vera |
| Verify evidence, patch review, final apply and Git changes | Vera + human operator |
| Validation of data passed across the bridge | This module |

The existing vera-readonly observer remains unchanged: it only runs
Vera CLI with --repo <trusted-cwd> status. This contract adds no executor,
startup rule, service, endpoint, or MCP write tool.

## Request example (data only)

~~~json
{
  "version": 1,
  "kind": "vera.task.request",
  "task_id": "issue-42",
  "goal": "Investigate the bug and prepare a patch for review",
  "execution": "isolated_proposal"
}
~~~

No command-line arguments, cwd, model credentials, approval, apply options or
Git operations are accepted. task_id is a correlation key, NOT an authorization
token. goal is untrusted text; the future executor must keep Vera's own rules.

## Result example (reported data, not proof)

~~~json
{
  "version": 1,
  "kind": "vera.task.result",
  "task_id": "issue-42",
  "status": "NEEDS_REVIEW",
  "summary": "Candidate change awaits independent verification",
  "evidence_ref": "run/42/evidence.json"
}
~~~

Status choices: SUCCESS, NEEDS_REVIEW, PARTIAL, BLOCKED, NEEDS_TEST_COMMAND.
Unknown statuses and unexpected fields are refused. The evidence reference is
an opaque, bounded claim, not an opened artifact or authenticated evidence.

## Handoff

- Matching task_id, status SUCCESS or NEEDS_REVIEW, and a claimed evidence
  reference: REVIEW_REQUIRED, never approved.
- All other outcomes: BLOCKED or invalid input error.
- authority.apply / commit / push / merge are always false.
- An Autoloop result never grants Vera a new permission.

## Activation gates: NOT MET

Before wiring a real task runner, verify Vera's machine-readable API/CLI and
status schema at a pinned commit. Require Vera-owned isolated workspaces,
authenticated evidence provenance, non-forgeable operator approvals, bounded
retries, idempotent resume, crash and cancellation coverage. The future adapter
must never execute arbitrary commands from incoming events.

Windows UAT must use the exact Vera executable/version. Test forged SUCCESS,
approval_token, malicious task text, cancelled tasks, and blocked verify; ensure
none can write to Vera Main or bypass the final Apply gate.

Do not enable recurring rules, task execution, Git operations or deployment
as part of this staged contract.
