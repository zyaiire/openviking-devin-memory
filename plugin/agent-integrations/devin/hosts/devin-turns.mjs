/**
 * Turn decoder for Devin's local session store (`sessions.db`).
 *
 * The decoding rules live in DESIGN.md ("Turn decoding"). The database is
 * opened read-only in place so rows still in the WAL are visible.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { sanitizeCapturedText } from "../../memory-plugin-shared/lib/capture-utils.mjs";

export const KNOWN_SCHEMA_VERSION = 20;

const REQUIRED_COLUMNS = {
  sessions: ["id", "main_chain_id"],
  message_nodes: ["session_id", "node_id", "parent_node_id", "chat_message", "metadata"],
};

const MAX_CHAIN_NODES = 200_000;

export function cleanDevinText(value) {
  return sanitizeCapturedText(typeof value === "string" ? value : "");
}

export function resolveDevinSessionsDb(env = process.env, home = homedir()) {
  if (env.OPENVIKING_DEVIN_SESSIONS_DB) return env.OPENVIKING_DEVIN_SESSIONS_DB;
  const dataHome = env.XDG_DATA_HOME || join(home, ".local", "share");
  return join(dataHome, "devin", "cli", "sessions.db");
}

let sqliteModule;
async function loadSqlite() {
  if (sqliteModule === undefined) {
    sqliteModule = await import("node:sqlite").catch(() => null);
  }
  return sqliteModule;
}

function parseJson(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function checkSchema(db) {
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    const missing = columns.filter((name) => !present.has(name));
    if (missing.length) return { ok: false, missing: `${table}.${missing.join(",")}` };
  }
  let version = null;
  try {
    version = db.prepare("SELECT MAX(version) AS v FROM refinery_schema_history").get()?.v ?? null;
  } catch {
    // The migration table is advisory; the column check above is the gate.
  }
  return { ok: true, version };
}

/**
 * Main-chain nodes in conversation order. Walks from `main_chain_id` to the
 * root; a compaction summary node's `summarized_from` continues the walk at
 * the pre-compaction tip, so turns before the compaction stay reachable.
 */
export function readMainChain(db, sessionId) {
  const session = db.prepare("SELECT main_chain_id AS tip FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return null;
  const getNode = db.prepare(
    "SELECT node_id, parent_node_id, chat_message, metadata FROM message_nodes WHERE session_id = ? AND node_id = ?",
  );
  const chain = [];
  const visited = new Set();
  let id = session.tip;
  while (id != null && !visited.has(id) && chain.length < MAX_CHAIN_NODES) {
    visited.add(id);
    const row = getNode.get(sessionId, id);
    if (!row) break;
    const meta = parseJson(row.metadata) || {};
    chain.push({ message: parseJson(row.chat_message) || {}, summarizedFrom: meta.summarized_from ?? null });
    id = meta.summarized_from ?? row.parent_node_id;
  }
  return chain.reverse();
}

/** Keep what the user typed and what the assistant said; one message is one turn. */
export function decodeDevinChain(chain) {
  const turns = [];
  const emitted = new Set();
  for (const node of chain) {
    const message = node.message;
    if (node.summarizedFrom != null) continue;
    const role = message.role;
    const isUserInput = message.metadata?.is_user_input === true || message.metadata?.is_user_input === 1;
    if (!(role === "user" && isUserInput) && role !== "assistant") continue;
    const content = cleanDevinText(message.content);
    if (!content) continue;
    const turnId = typeof message.message_id === "string" && message.message_id ? message.message_id : null;
    if (turnId) {
      const key = `${turnId}:${role}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
    }
    turns.push(turnId ? { role, content, turnId } : { role, content });
  }
  return turns;
}

/** Turns after the last fully captured one; the whole chain when the cursor left it (rewind, edit). */
export function unseenTurns(turns, lastTurnId) {
  if (!lastTurnId) return turns;
  let index = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].turnId === lastTurnId) {
      index = i;
      break;
    }
  }
  return index < 0 ? turns : turns.slice(index + 1);
}

export async function extractDevinTurns(dbPath, sessionId, lastTurnId = null) {
  if (!sessionId) return { status: "no_session", turns: [] };
  if (!dbPath || !existsSync(dbPath)) return { status: "missing", turns: [] };
  const sqlite = await loadSqlite();
  if (!sqlite?.DatabaseSync) return { status: "no_sqlite", turns: [] };
  let db;
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true, timeout: 2000 });
  } catch (error) {
    return { status: "unreadable", turns: [], error: error?.code || error?.message || "open_failed" };
  }
  try {
    const schema = checkSchema(db);
    if (!schema.ok) return { status: "unknown_schema", turns: [], error: schema.missing };
    const chain = readMainChain(db, sessionId);
    if (!chain) return { status: "missing_session", turns: [] };
    const turns = unseenTurns(decodeDevinChain(chain), lastTurnId);
    const warning = schema.version != null && schema.version > KNOWN_SCHEMA_VERSION
      ? `schema ${schema.version} newer than ${KNOWN_SCHEMA_VERSION}`
      : undefined;
    return { status: "ok", turns, ...(warning ? { warning } : {}) };
  } catch (error) {
    return { status: "unreadable", turns: [], error: error?.code || error?.message || "read_failed" };
  } finally {
    try {
      db.close();
    } catch {
      // Already closed.
    }
  }
}

export function buildDevinTurns(input = {}, state = {}) {
  return extractDevinTurns(
    resolveDevinSessionsDb(),
    String(input.session_id || "").trim(),
    state.lastTurnId || null,
  );
}
