/**
 * Turn decoder for Devin's local session store (`sessions.db`).
 *
 * The decoding rules live in DESIGN.md ("Turn decoding"). Until the decoder
 * lands, capture reports `not_implemented` and sends nothing.
 */

const INJECTED_BLOCK_RE = /<openviking-context\b[^>]*>[\s\S]*?<\/openviking-context>/gi;
const RELEVANT_MEMORIES_RE = /<relevant-memories>[\s\S]*?<\/relevant-memories>/gi;
const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/gi;

export function cleanDevinText(value) {
  return String(value || "")
    .replace(INJECTED_BLOCK_RE, "")
    .replace(RELEVANT_MEMORIES_RE, "")
    .replace(SYSTEM_REMINDER_RE, "")
    .trim();
}

export function buildDevinTurns() {
  return { status: "not_implemented", turns: [] };
}
