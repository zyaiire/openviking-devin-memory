import { addAgentMessages, commitAgentSession } from "../../memory-plugin-shared/lib/agent-hook-runtime.mjs";
import {
  applyIncrementalCaptureResult,
  buildIncrementalCapturePlan,
} from "./incremental-turn-capture.mjs";
import { buildDevinTurns, cleanDevinText } from "./devin-turns.mjs";

export function shouldCommitDevinCapture(event, cfg = {}, previous = 0, captured = 0) {
  const uncommitted = Number(previous || 0) + captured;
  if (uncommitted <= 0) return false;
  if (event === "session-end") return true;
  if (event === "pre-compact") return cfg.autoCommitOnCompact !== false;
  return uncommitted >= Number(cfg.commitTurnThreshold || Infinity);
}

export const devin = {
  prefix: "dv-",
  capturesOnlyWhenEnabled: true,
  // Whether Devin kills a timed-out hook's descendants is not measured, so
  // capture runs inside the hook's own timeout.
  detachesCapture: false,
  profileStage: "session-start",
  requestBudgets: {
    "session-start": 25_000,
    "user-prompt-submit": 17_000,
    stop: 25_000,
    "pre-compact": 25_000,
    "session-end": 25_000,
  },
  stages: {
    "session-start": "start",
    "user-prompt-submit": "prompt",
    stop: "capture",
    "pre-compact": "capture",
    "session-end": "capture",
  },
  normalizeInput(input = {}) {
    // Only PreCompact/PostCompact carry `cwd`; every event runs with
    // DEVIN_PROJECT_DIR set to the project root.
    if (input.cwd || !process.env.DEVIN_PROJECT_DIR) return input;
    return { ...input, cwd: process.env.DEVIN_PROJECT_DIR };
  },
  envelope(event, block) {
    if (!block) return null;
    if (event === "session-start") {
      return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: block } };
    }
    if (event === "user-prompt-submit") {
      return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: block } };
    }
    return null;
  },
  guard() {
    // Devin's PreToolUse tool names are not measured yet, so the plugin
    // registers no PreToolUse hook and there is nothing to deny.
    return {};
  },
  prompt(input) {
    return typeof input.prompt === "string" ? cleanDevinText(input.prompt) : "";
  },
  async capture(ctx, state, event) {
    const transcript = buildDevinTurns(ctx.input, state, ctx.cfg);
    if (transcript.status !== "ok") {
      ctx.log(`capture_${transcript.status}`, transcript.error ? { error: transcript.error } : {});
      return null;
    }
    const plan = buildIncrementalCapturePlan(transcript.turns, state, ctx.cfg);
    let next;
    if (plan.toSend.length > 0) {
      const result = await addAgentMessages(ctx.fetchJSON, ctx.sessionId, plan.payloads, ctx.peerId);
      next = applyIncrementalCaptureResult(state, plan, result, cleanDevinText);
    } else if (shouldCommitDevinCapture(event, ctx.cfg, state.capturedSinceCommit, 0)) {
      next = { ...state, captured: 0 };
    } else {
      return null;
    }
    let capturedSinceCommit = Number(state.capturedSinceCommit || 0) + next.captured;
    if (shouldCommitDevinCapture(event, ctx.cfg, state.capturedSinceCommit, next.captured)) {
      const committed = await commitAgentSession(ctx.fetchJSON, ctx.sessionId, ctx.log);
      if (committed.ok || committed.pendingQueued) capturedSinceCommit = 0;
    }
    const { captured, ...persisted } = next;
    return { ...persisted, capturedSinceCommit };
  },
};
