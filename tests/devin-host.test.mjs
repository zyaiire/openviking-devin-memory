import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { devin, shouldCommitDevinCapture } from "../plugin/agent-integrations/devin/hosts/devin.mjs";
import { HOSTS } from "../plugin/agent-integrations/devin/hosts/index.mjs";
import { buildSessionsDb, sessionFixture } from "./helpers/sessions-db.mjs";

const stdin = JSON.parse(readFileSync(new URL("./fixtures/hook-stdin.json", import.meta.url), "utf8"));

process.env.OPENVIKING_PENDING_DIR = mkdtempSync(join(tmpdir(), "ov-devin-pending-"));

function fakeServer() {
  const calls = [];
  const fetchJSON = async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
    return { ok: true, result: {} };
  };
  return { calls, fetchJSON };
}

function ctxFor(input, server, cfg = {}) {
  return {
    cfg,
    input,
    sessionId: "dv-fixture-compact",
    fetchJSON: server.fetchJSON,
    peerId: "",
    log: () => {},
  };
}

test("the devin host is registered under its client id", () => {
  assert.equal(HOSTS.devin, devin);
  for (const event of Object.keys(stdin).filter((key) => !key.startsWith("_"))) {
    const name = event.replace(/-desktop$/, "");
    assert.ok(devin.stages[name], `stage for ${name}`);
  }
});

test("context is injected only for SessionStart and UserPromptSubmit", () => {
  assert.deepEqual(devin.envelope("session-start", "<b/>"), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "<b/>" },
  });
  assert.deepEqual(devin.envelope("user-prompt-submit", "<b/>"), {
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "<b/>" },
  });
  assert.equal(devin.envelope("session-start", ""), null);
  assert.equal(devin.envelope("stop", "<b/>"), null);
});

test("cwd comes from DEVIN_PROJECT_DIR unless the payload carries one", () => {
  const previous = process.env.DEVIN_PROJECT_DIR;
  process.env.DEVIN_PROJECT_DIR = "/tmp/devin-project";
  try {
    assert.equal(devin.normalizeInput(stdin.stop).cwd, "/tmp/devin-project");
    assert.equal(devin.normalizeInput(stdin["pre-compact"]).cwd, "/tmp/fixture-project");
  } finally {
    if (previous === undefined) delete process.env.DEVIN_PROJECT_DIR;
    else process.env.DEVIN_PROJECT_DIR = previous;
  }
});

test("the recall query is the typed prompt without injected blocks", () => {
  assert.equal(devin.prompt(stdin["user-prompt-submit"]), "Next, add a CI check for key age.");
  assert.equal(devin.prompt({ prompt: "<openviking-context>x</openviking-context>\nhi there" }), "hi there");
  assert.equal(devin.prompt({}), "");
});

test("commit policy: Stop appends, SessionEnd and PreCompact commit", () => {
  assert.equal(shouldCommitDevinCapture("stop", {}, 0, 3), false);
  assert.equal(shouldCommitDevinCapture("stop", { commitTurnThreshold: 4 }, 2, 2), true);
  assert.equal(shouldCommitDevinCapture("session-end", {}, 1, 0), true);
  assert.equal(shouldCommitDevinCapture("session-end", {}, 0, 0), false);
  assert.equal(shouldCommitDevinCapture("pre-compact", {}, 1, 0), true);
  assert.equal(shouldCommitDevinCapture("pre-compact", { autoCommitOnCompact: false }, 1, 0), false);
});

test("repeated Stop sends each turn once, and SessionEnd commits", async () => {
  const previous = process.env.OPENVIKING_DEVIN_SESSIONS_DB;
  process.env.OPENVIKING_DEVIN_SESSIONS_DB = buildSessionsDb();
  try {
    const server = fakeServer();
    let state = {};

    state = await devin.capture(ctxFor(stdin.stop, server), state, "stop");
    const batches = server.calls.filter((call) => call.path.endsWith("/messages/batch"));
    assert.equal(batches.length, 1);
    assert.deepEqual(
      batches[0].body.messages.map(({ role, content, turn_id }) => ({ role, content, turnId: turn_id })),
      sessionFixture("fixture-compact").expected,
    );
    assert.equal(state.capturedSinceCommit, 6);
    assert.equal(state.lastTurnId, "m-asst-3");
    assert.equal(server.calls.some((call) => call.path.endsWith("/commit")), false);

    assert.equal(await devin.capture(ctxFor(stdin.stop, server), state, "stop"), null);
    assert.equal(server.calls.length, 1);

    state = await devin.capture(ctxFor(stdin["session-end"], server), state, "session-end");
    assert.equal(server.calls.length, 2);
    assert.equal(server.calls[1].path, "/api/v1/sessions/dv-fixture-compact/commit");
    assert.equal(state.capturedSinceCommit, 0);

    assert.equal(await devin.capture(ctxFor(stdin["session-end"], server), state, "session-end"), null);
    assert.equal(server.calls.length, 2);
  } finally {
    if (previous === undefined) delete process.env.OPENVIKING_DEVIN_SESSIONS_DB;
    else process.env.OPENVIKING_DEVIN_SESSIONS_DB = previous;
  }
});

test("an unreadable database sends nothing but still commits turns sent earlier", async () => {
  const previous = process.env.OPENVIKING_DEVIN_SESSIONS_DB;
  process.env.OPENVIKING_DEVIN_SESSIONS_DB = join(tmpdir(), "no-such-dir", "sessions.db");
  try {
    const server = fakeServer();
    assert.equal(await devin.capture(ctxFor(stdin.stop, server), {}, "stop"), null);
    assert.equal(await devin.capture(ctxFor(stdin["session-end"], server), {}, "session-end"), null);
    assert.deepEqual(server.calls, []);
    const state = await devin.capture(ctxFor(stdin["session-end"], server), { capturedSinceCommit: 2 }, "session-end");
    assert.deepEqual(server.calls.map((call) => call.path), ["/api/v1/sessions/dv-fixture-compact/commit"]);
    assert.equal(state.capturedSinceCommit, 0);
  } finally {
    if (previous === undefined) delete process.env.OPENVIKING_DEVIN_SESSIONS_DB;
    else process.env.OPENVIKING_DEVIN_SESSIONS_DB = previous;
  }
});
