// Staged Vera task handoff. Pure data validation, no process execution or
// privilege transfer. Vera alone owns workspace isolation, verify and apply.
export const VERA_BRIDGE_VERSION = 1 as const;
export type VeraStatus = "SUCCESS" | "NEEDS_REVIEW" | "PARTIAL" | "BLOCKED" | "NEEDS_TEST_COMMAND";
export type VeraTaskRequest = Readonly<{
  version: 1;
  kind: "vera.task.request";
  task_id: string;
  goal: string;
  execution: "isolated_proposal";
}>;
export type VeraTaskResult = Readonly<{
  version: 1;
  kind: "vera.task.result";
  task_id: string;
  status: VeraStatus;
  summary: string;
  evidence_ref?: string;
}>;
export type VeraHandoff = Readonly<{
  task_id: string;
  vera_status: VeraStatus;
  state: "REVIEW_REQUIRED" | "BLOCKED";
  evidence_claimed: boolean;
  authority: Readonly<{ apply: false; commit: false; push: false; merge: false }>;
}>;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const STATUSES: readonly string[] = [
  "SUCCESS", "NEEDS_REVIEW", "PARTIAL", "BLOCKED", "NEEDS_TEST_COMMAND",
];

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error("unexpected field: " + key);
  }
}

function text(value: unknown, key: string, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || value.includes("\u0000")) {
    throw new Error("invalid " + key);
  }
  return value;
}

function taskId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw new Error("invalid task_id");
  return value;
}

export function parseVeraTaskRequest(input: unknown): VeraTaskRequest {
  const data = object(input);
  only(data, ["version", "kind", "task_id", "goal", "execution"]);
  if (data.version !== VERA_BRIDGE_VERSION || data.kind !== "vera.task.request") {
    throw new Error("unsupported task request version or kind");
  }
  if (data.execution !== "isolated_proposal") {
    throw new Error("execution must be isolated_proposal");
  }
  return {
    version: VERA_BRIDGE_VERSION,
    kind: "vera.task.request",
    task_id: taskId(data.task_id),
    goal: text(data.goal, "goal", 4000),
    execution: "isolated_proposal",
  };
}

export function parseVeraTaskResult(input: unknown): VeraTaskResult {
  const data = object(input);
  only(data, ["version", "kind", "task_id", "status", "summary", "evidence_ref"]);
  if (data.version !== VERA_BRIDGE_VERSION || data.kind !== "vera.task.result") {
    throw new Error("unsupported task result version or kind");
  }
  if (typeof data.status !== "string" || !STATUSES.includes(data.status)) {
    throw new Error("invalid status");
  }
  const evidence = data.evidence_ref;
  if (evidence !== undefined) {
    // An opaque reference, not a path to open or a validation of its contents.
    // Keep absolute paths, URLs and traversal out of the wire contract.
    if (
      typeof evidence !== "string" || evidence.length > 256 ||
      !/^[A-Za-z0-9_.\/-]+$/.test(evidence) ||
      evidence.startsWith("/") ||
      evidence.split("/").some((part) => part === "." || part === ".." || part === "")
    ) {
      throw new Error("invalid evidence_ref");
    }
  }
  return {
    version: VERA_BRIDGE_VERSION,
    kind: "vera.task.result",
    task_id: taskId(data.task_id),
    status: data.status as VeraStatus,
    summary: text(data.summary, "summary", 2000),
    ...(evidence === undefined ? {} : { evidence_ref: evidence }),
  };
}

/** A claimed result is NOT an approval or proof of verified execution. */
export function evaluateVeraTask(request: unknown, result: unknown): VeraHandoff {
  const wanted = parseVeraTaskRequest(request);
  const reported = parseVeraTaskResult(result);
  if (reported.task_id !== wanted.task_id) throw new Error("task_id mismatch");
  const evidence_claimed = reported.evidence_ref !== undefined;
  const reviewable = evidence_claimed &&
    (reported.status === "SUCCESS" || reported.status === "NEEDS_REVIEW");
  return {
    task_id: wanted.task_id,
    vera_status: reported.status,
    state: reviewable ? "REVIEW_REQUIRED" : "BLOCKED",
    evidence_claimed,
    // This contract has no operator-approval or mutation capability.
    authority: { apply: false, commit: false, push: false, merge: false },
  };
}
