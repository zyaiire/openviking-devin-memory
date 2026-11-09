import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  KNOWN_SCHEMA_VERSION,
  extractDevinTurns,
  resolveDevinSessionsDb,
  unseenTurns,
} from "../plugin/agent-integrations/devin/hosts/devin-turns.mjs";
import { buildSessionsDb, fixture, sessionFixture } from "./helpers/sessions-db.mjs";

test("a compacted session decodes to exactly the typed prompts and assistant replies", async () => {
  const db = buildSessionsDb();
  const result = await extractDevinTurns(db, "fixture-compact");
  assert.equal(result.status, "ok");
  assert.equal(result.warning, undefined);
  assert.deepEqual(result.turns, sessionFixture("fixture-compact").expected);
});

test("a resumed session's copied node is sent once", async () => {
  const db = buildSessionsDb();
  const result = await extractDevinTurns(db, "fixture-resume");
  assert.deepEqual(result.turns, sessionFixture("fixture-resume").expected);
});

test("the cursor skips turns already captured", async () => {
  const db = buildSessionsDb();
  const result = await extractDevinTurns(db, "fixture-compact", "m-asst-2");
  assert.deepEqual(result.turns.map((turn) => turn.turnId), ["m-user-3", "m-asst-3"]);
});

test("a cursor no longer on the main chain rescans the whole chain", () => {
  const turns = sessionFixture("fixture-resume").expected;
  assert.deepEqual(unseenTurns(turns, "abandoned-branch"), turns);
  assert.deepEqual(unseenTurns(turns, "r-asst-2"), []);
});

test("rows still in the WAL are visible to the read-only reader", async () => {
  const path = buildSessionsDb({ sessions: [sessionFixture("fixture-resume")] });
  const writer = new DatabaseSync(path);
  try {
    writer.exec("PRAGMA wal_autocheckpoint = 0");
    writer.prepare(
      "INSERT INTO message_nodes (session_id, node_id, parent_node_id, chat_message, created_at, metadata) VALUES (?, ?, ?, ?, 0, NULL)",
    ).run("fixture-resume", 7, 6, JSON.stringify({
      role: "user",
      content: "Then draft the 1.5 notes.",
      message_id: "r-user-3",
      metadata: { is_user_input: true },
    }));
    writer.prepare("UPDATE sessions SET main_chain_id = 7 WHERE id = ?").run("fixture-resume");
    const result = await extractDevinTurns(path, "fixture-resume", "r-asst-2");
    assert.deepEqual(result.turns, [{ role: "user", content: "Then draft the 1.5 notes.", turnId: "r-user-3" }]);
  } finally {
    writer.close();
  }
});

test("a message without message_id is sent without turn_id", async () => {
  const session = {
    id: "fixture-no-id",
    main_chain_id: 2,
    nodes: [
      { node_id: 1, parent: null, role: "user", is_user_input: true, content: "Explain the retry budget." },
      { node_id: 2, parent: 1, role: "assistant", content: "Each hook gets its own request budget." },
    ],
  };
  const result = await extractDevinTurns(buildSessionsDb({ sessions: [session] }), "fixture-no-id");
  assert.deepEqual(result.turns, [
    { role: "user", content: "Explain the retry budget." },
    { role: "assistant", content: "Each hook gets its own request budget." },
  ]);
});

test("a missing database, session or session id is skipped, not guessed", async () => {
  const db = buildSessionsDb();
  assert.equal((await extractDevinTurns(join(tmpdir(), "no-such-dir", "sessions.db"), "x")).status, "missing");
  assert.equal((await extractDevinTurns(db, "no-such-session")).status, "missing_session");
  assert.equal((await extractDevinTurns(db, "")).status, "no_session");
});

test("an unknown schema is skipped", async () => {
  const ddl = `
    CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT NOT NULL, backend_type TEXT NOT NULL, model TEXT NOT NULL, agent_mode TEXT NOT NULL, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, main_chain_id INTEGER);
    CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, node_id INTEGER NOT NULL, parent_id INTEGER, chat_message TEXT NOT NULL, created_at INTEGER NOT NULL, metadata TEXT);
  `;
  const path = join(mkdtempSync(join(tmpdir(), "ov-devin-db-")), "sessions.db");
  const db = new DatabaseSync(path);
  db.exec(ddl);
  db.close();
  const result = await extractDevinTurns(path, "fixture-compact");
  assert.equal(result.status, "unknown_schema");
  assert.match(result.error, /parent_node_id/);
});

test("a newer migration with the needed columns still captures, with a warning", async () => {
  const db = buildSessionsDb({ schemaVersion: KNOWN_SCHEMA_VERSION + 1 });
  const result = await extractDevinTurns(db, "fixture-compact");
  assert.equal(result.status, "ok");
  assert.match(result.warning, /newer/);
  assert.equal(result.turns.length, sessionFixture("fixture-compact").expected.length);
});

test("a file that is not SQLite is unreadable", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ov-devin-db-")), "sessions.db");
  writeFileSync(path, "not a database");
  assert.equal((await extractDevinTurns(path, "fixture-compact")).status, "unreadable");
});

test("the database path follows XDG_DATA_HOME, with an explicit override", () => {
  assert.equal(resolveDevinSessionsDb({}, "/home/u"), "/home/u/.local/share/devin/cli/sessions.db");
  assert.equal(resolveDevinSessionsDb({ XDG_DATA_HOME: "/data" }, "/home/u"), "/data/devin/cli/sessions.db");
  assert.equal(resolveDevinSessionsDb({ OPENVIKING_DEVIN_SESSIONS_DB: "/x.db" }, "/home/u"), "/x.db");
});

test("the fixture is anonymized", () => {
  const text = JSON.stringify(fixture);
  assert.doesNotMatch(text, /\/Users\/|@[a-z0-9-]+\.[a-z]{2,}|sk-[A-Za-z0-9]/);
});
