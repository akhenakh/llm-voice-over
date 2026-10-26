/**
 * A permission request, as the classic `PermissionRequest` hook records it for
 * the mod.
 *
 * The hook runs for every ask, whether or not a dialog follows: a mode can
 * answer it (auto mode's classifier, `dontAsk`), a headless run has no dialog to
 * show, and asking a question shows the question itself rather than a permission
 * prompt. The record carries what the mod needs to keep quiet for those, and
 * `promptShows` decides.
 */

/** Three tab-separated fields: `mode`, `tool`, and the asking agent's id. */
export interface PromptRecord {
  /** The session's permission mode when the ask was made. */
  mode: string;
  /** The tool whose call asked, as the model names it. */
  tool: string;
  /** True when the ask came from a subagent's loop. */
  fromAgent: boolean;
}

/** No field can hold a tab, so the record splits cleanly; any other shape is stale. */
export function parsePromptRecord(text: string): PromptRecord | undefined {
  const fields = text.replace(/\r?\n$/, "").split("\t");
  if (fields.length !== 3) return undefined;
  const [mode, tool, agent] = fields as [string, string, string];
  if (!tool) return undefined;
  return { mode, tool, fromAgent: agent !== "" };
}

/** Modes that answer an ask themselves, so no dialog reaches the person. */
const SELF_ANSWERING_MODES = new Set(["auto", "dontAsk", "bypassPermissions"]);

/**
 * The `AskUserQuestion` tool's dialog is the question itself: the person answers
 * it there, and no permission prompt for it is drawn in any mode.
 */
const QUESTIONS = new Set(["AskUserQuestion"]);

export function promptShows(record: PromptRecord): boolean {
  if (record.fromAgent) return false;
  if (SELF_ANSWERING_MODES.has(record.mode)) return false;
  return !QUESTIONS.has(record.tool);
}
