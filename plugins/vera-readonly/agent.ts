// Intentionally narrow Vera bridge: one fixed, observational CLI command.
// It is NOT a coding agent and never forwards event text as executable input.
import { findProgram, tail, type Adapter } from "../../worker/agents.ts";

export default {
  command(turn) {
    // Autoloop defaults can be broader than Vera's approval boundary.
    // Refuse them before spawning anything.
    if (turn.access !== "read") throw new Error("vera-readonly requires access: read");
    if (turn.resume !== null) throw new Error("vera-readonly does not support resumed sessions");
    if (turn.command?.length) throw new Error("vera-readonly refuses custom commands");
    if (turn.model || turn.effort || turn.tier) {
      throw new Error("vera-readonly does not run a model or coding task");
    }

    // No user/event prompt, receipt, shell expression, or arbitrary subcommand
    // reaches the child process. cwd is assigned by the trusted rule, not event data.
    const program = turn.program ?? findProgram("vera");
    return [program, "--repo", turn.cwd, "status"];
  },
  read(stdout, code, stderr) {
    if (code === null) return {};
    if (code !== 0) {
      return { error: "Vera status failed (exit " + code + "): " + tail(stderr || stdout) };
    }
    if (!stdout.trim()) return { error: "Vera status returned no output" };
    return { text: "Vera status snapshot (no task executed):\n" + tail(stdout, 2000) };
  },
} satisfies Adapter;
