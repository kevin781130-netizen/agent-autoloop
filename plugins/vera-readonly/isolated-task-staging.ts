// Stages one Vera task in an independent Git checkout; never executes it.
// A Git clone is NOT an OS sandbox. Task execution requires a separate gate.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, realpathSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseVeraTaskRequest } from "./task-contract.ts";

const SHA = /^[0-9a-f]{40}$/;
export type StagingOptions = {
  sourceRepo: string;
  expectedSourceSha: string;
  scratchRoot?: string;
};
export type StagedTask = Readonly<{
  version: 1;
  task_id: string;
  source_sha: string;
  snapshot_path: string;
  stage_directory: string;
  state: "STAGED_ONLY";
  executable: false;
  authority: Readonly<{ apply: false; commit: false; push: false; merge: false }>;
}>;

function git(args: string[], timeout = 30_000): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    shell: false,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function canonical(directory: string): string {
  return path.normalize(realpathSync(directory));
}
function samePath(a: string, b: string): boolean {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/**
 * Refuses dirty/unpinned or non-root sources; clones committed HEAD only.
 * Returns a staged snapshot, never a command or permission to run Vera.
 */
export function stageVeraTask(request: unknown, options: StagingOptions): StagedTask {
  const task = parseVeraTaskRequest(request);
  if (!SHA.test(options.expectedSourceSha)) throw new Error("expectedSourceSha must be a full lowercase Git SHA");
  if (!options.sourceRepo || lstatSync(options.sourceRepo).isSymbolicLink()) {
    throw new Error("sourceRepo must be a non-symlink local Git repository");
  }
  const source = canonical(options.sourceRepo);
  const top = canonical(git(["-C", source, "rev-parse", "--show-toplevel"]));
  if (!samePath(source, top)) throw new Error("sourceRepo must be Git worktree root");
  const current = git(["-C", source, "rev-parse", "HEAD"]);
  if (current !== options.expectedSourceSha) throw new Error("source HEAD does not match pinned SHA");
  if (git(["-C", source, "status", "--porcelain", "--untracked-files=all"])) {
    throw new Error("source worktree is dirty");
  }

  const scratch = canonical(options.scratchRoot ?? tmpdir());
  const stage_directory = mkdtempSync(path.join(scratch, "vera-task-staging-"));
  const snapshot_path = path.join(stage_directory, "checkout");
  try {
    // --no-local ensures snapshot has its own Git object store and no hardlinks.
    // --no-checkout followed by detached pinned HEAD avoids copying local edits.
    git(["clone", "--quiet", "--no-local", "--no-hardlinks", "--no-checkout", source, snapshot_path], 120_000);
    git(["-C", snapshot_path, "checkout", "--quiet", "--force", "--detach", current], 120_000);
    if (git(["-C", snapshot_path, "rev-parse", "HEAD"]) !== current) {
      throw new Error("snapshot SHA mismatch");
    }
    if (git(["-C", snapshot_path, "status", "--porcelain", "--untracked-files=all"])) {
      throw new Error("snapshot not clean");
    }
    if (!existsSync(path.join(snapshot_path, ".git"))) throw new Error("snapshot has no independent .git");
    return {
      version: 1,
      task_id: task.task_id,
      source_sha: current,
      snapshot_path,
      stage_directory,
      state: "STAGED_ONLY",
      executable: false,
      authority: { apply: false, commit: false, push: false, merge: false },
    };
  } catch (error) {
    rmSync(stage_directory, { recursive: true, force: true });
    throw error;
  }
}
