import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/sessions-db.json", import.meta.url), "utf8"),
);

// Columns as measured on schema migration 20.
const DDL = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, working_directory TEXT NOT NULL, backend_type TEXT NOT NULL, model TEXT NOT NULL,
  agent_mode TEXT NOT NULL, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, title TEXT,
  main_chain_id INTEGER, shell_last_seen_index INTEGER, cogs_json TEXT, workspace_dirs TEXT,
  hidden INTEGER NOT NULL DEFAULT 0, metadata TEXT
);
CREATE TABLE message_nodes (
  row_id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, node_id INTEGER NOT NULL, parent_node_id INTEGER,
  chat_message TEXT NOT NULL, created_at INTEGER NOT NULL, metadata TEXT, UNIQUE(session_id, node_id)
);
CREATE TABLE refinery_schema_history (version INTEGER PRIMARY KEY, name TEXT, applied_on TEXT, checksum TEXT);
`;

function chatMessage(node) {
  return JSON.stringify({
    role: node.role,
    content: node.content,
    message_id: node.message_id,
    ...(node.tool_calls ? { tool_calls: node.tool_calls } : {}),
    ...(node.tool_call_id ? { tool_call_id: node.tool_call_id } : {}),
    ...(node.phase ? { phase: node.phase } : {}),
    metadata: {
      created_at: "2026-11-09T00:00:00Z",
      is_user_input: node.is_user_input ?? null,
      ...(node.is_user_input ? { from_event_id: `ev-${node.node_id}` } : {}),
    },
  });
}

function nodeMetadata(node) {
  return JSON.stringify({
    is_system_prefix: null,
    num_tokens_preceding: null,
    summarized_from: null,
    ...(node.node_meta || {}),
  });
}

/** Write the fixture to a fresh sessions.db; returns its path. */
export function buildSessionsDb({ sessions = fixture.sessions, schemaVersion = fixture.schemaVersion, ddl = DDL } = {}) {
  const path = join(mkdtempSync(join(tmpdir(), "ov-devin-db-")), "sessions.db");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(ddl);
  if (schemaVersion != null) {
    db.prepare("INSERT INTO refinery_schema_history (version, name) VALUES (?, ?)").run(schemaVersion, "fixture");
  }
  const insertSession = db.prepare(
    "INSERT INTO sessions (id, working_directory, backend_type, model, agent_mode, created_at, last_activity_at, main_chain_id) VALUES (?, '/tmp/fixture-project', 'local', 'fixture-model', 'default', 0, 0, ?)",
  );
  const insertNode = db.prepare(
    "INSERT INTO message_nodes (session_id, node_id, parent_node_id, chat_message, created_at, metadata) VALUES (?, ?, ?, ?, 0, ?)",
  );
  for (const session of sessions) {
    insertSession.run(session.id, session.main_chain_id);
    for (const node of session.nodes) {
      insertNode.run(session.id, node.node_id, node.parent, chatMessage(node), nodeMetadata(node));
    }
  }
  db.close();
  return path;
}

export function sessionFixture(id) {
  return fixture.sessions.find((session) => session.id === id);
}
