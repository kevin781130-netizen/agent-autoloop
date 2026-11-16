# Vera / Autoloop — execution preflight, knife 5

**Status: STAGED_ONLY. No unattended task execution is enabled.**

## Verified CLI constraints

- Vera main at commit 6b847bb0f70c4a6d98f63db8d2225c9d12215065:
  agent_core/code_task_cli.py runs CodingCore in-place with
  use_worktree=False and allow_in_place_fallback=True.
- Vera repair branch fix/vera-release-convergence-82-20261114 at
  96f57cce70e3e03712f588f7d3461fc668c17faf adds an explicit
  --allow-in-place authorization check, but is still in-place.
- Thus a direct Autoloop task call against the user's Vera source
  checkout is forbidden. This is an inspection of GitHub source,
  not a claim that this Vera branch passed local Windows UAT.

## Implementation

plugins/vera-readonly/isolated-task-staging.ts exports stageVeraTask.

The staging function:
1. Strictly validates the existing data-only task request.
2. Requires a trusted absolute Git repository root with a clean
   worktree and an explicit, exact 40-character HEAD SHA.
3. Creates its own temporary directory and Git object store,
   checking out the pinned commit to a detached snapshot.
4. Verifies the snapshot SHA and clean state.
5. Returns STAGED_ONLY, executable:false and all Git/apply
   authorities set to false.

The function does not start Python, call CodingCore, run tests,
apply patches, install services, register rules or enable MCP
write methods. No new agent.ts is added. Existing vera-readonly
continues to run only vera status.

## Security boundary

A Git clone is **not** a sandbox. An editor process, hook or build
test running inside a clone could still access files and credentials
outside the clone with the caller's OS permissions. The staging module
therefore deliberately has no run/execute function. Do not treat
the copy as a security boundary, nor set it up on a live recurring rule.

The request goal is untrusted data. Do not convert it into shell
code, repository paths, environment variables, editor commands,
approval tokens or Git operations.

## Requirements before next knife (NOT YET VERIFIED)

- Pin the exact Vera executable/commit with a non-interactive,
  machine-readable task result contract, not a generic status label.
- Require an OS-enforced filesystem/credential boundary with the
  original source checkout inaccessible to the task's editor process.
- Prove termination, cancellation and retry/idempotency behavior.
- Verify test evidence inside the snapshot and correlate it to the
  Autoloop task ID. Claimed evidence_ref is not proof.
- Run Windows Node 24 tests and a real Vera CLI negative test
  (attempts to alter original checkout must fail).
- Continue to block automatic Apply, Commit, Push and Merge.

## Targeted test

node --disable-warning=ExperimentalWarning --test tests/vera-isolated-task-staging.test.ts

The above command has not been executed merely because this source
was committed; attach actual run output before marking it PASS.
