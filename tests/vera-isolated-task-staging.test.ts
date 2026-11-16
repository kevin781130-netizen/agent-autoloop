// Regression: in-place Vera CLI must never receive the original checkout.
// Refuse dirty/unpinned input, reject command/approval fields, and stage only
// a distinct committed Git snapshot without running the CLI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stageVeraTask } from "../plugins/vera-readonly/isolated-task-staging.ts";

const base = mkdtempSync(path.join(tmpdir(), "vera-stage-test-"));
const repo = path.join(base, "source");
mkdirSync(repo);
function git(...args: string[]) {
  return execFileSync("git", args, {
    encoding: "utf8", windowsHide: true, shell: false,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}
git("init", "--quiet", repo);
git("-C", repo, "config", "user.name", "Test User");
git("-C", repo, "config", "user.email", "test@example.invalid");
git("-C", repo, "config", "commit.gpgsign", "false");
writeFileSync(path.join(repo, "original.txt"), "original content\n");
git("-C", repo, "add", "original.txt");
git("-C", repo, "commit", "--quiet", "-m", "fixture");
const sha = git("-C", repo, "rev-parse", "HEAD");
const request = {
  version: 1,
  kind: "vera.task.request",
  task_id: "issue-42",
  goal: "Fix one broken test",
  execution: "isolated_proposal",
};
const options = { sourceRepo: repo, expectedSourceSha: sha, scratchRoot: base };
after(() => rmSync(base, { recursive: true, force: true }));

test("stages an independent Git copy without executing Vera", () => {
  const stage = stageVeraTask(request, options);
  try {
    assert.equal(stage.state, "STAGED_ONLY");
    assert.equal(stage.executable, false);
    assert.equal(stage.source_sha, sha);
    assert.notEqual(stage.snapshot_path, repo);
    assert.equal(git("-C", stage.snapshot_path, "rev-parse", "HEAD"), sha);
    assert.equal(git("-C", stage.snapshot_path, "status", "--porcelain"), "");
    assert.ok(existsSync(path.join(stage.snapshot_path, ".git")));
    assert.ok(!existsSync(path.join(stage.snapshot_path, ".git", "objects", "info", "alternates")));
    assert.deepEqual(stage.authority, { apply: false, commit: false, push: false, merge: false });
    writeFileSync(path.join(stage.snapshot_path, "original.txt"), "changed only in clone\n");
    assert.equal(readFileSync(path.join(repo, "original.txt"), "utf8"), "original content\n");
    assert.equal(git("-C", repo, "status", "--porcelain"), "");
  } finally {
    rmSync(stage.stage_directory, { recursive: true, force: true });
  }
});

test("refuses unpinned or mismatched source", () => {
  assert.throws(() => stageVeraTask(request, { ...options, expectedSourceSha: "main" }), /full lowercase Git SHA/);
  assert.throws(() => stageVeraTask(request, { ...options, expectedSourceSha: "0".repeat(40) }), /does not match/);
  assert.equal(git("-C", repo, "status", "--porcelain"), "");
});

test("refuses dirty source and does not stage partial changes", () => {
  writeFileSync(path.join(repo, "untracked.txt"), "unsaved\n");
  try {
    assert.throws(() => stageVeraTask(request, options), /source worktree is dirty/);
  } finally {
    rmSync(path.join(repo, "untracked.txt"));
  }
});

test("cannot smuggle shell commands, approvals, paths or apply intent", () => {
  for (const injected of [
    { command: ["git", "push", "--force"] },
    { approval_token: "forged" },
    { cwd: repo },
    { execution: "apply" },
  ]) {
    assert.throws(() => stageVeraTask({ ...request, ...injected }, options));
  }
  assert.equal(git("-C", repo, "status", "--porcelain"), "");
});
