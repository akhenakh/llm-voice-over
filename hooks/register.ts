/**
 * Claude Code mod: spoken turn-end notifications.
 *
 * The mod runs inside Claude Code's process, so the queue lives in this file:
 * the `announce` tool stores the phrase, `turn.complete` speaks it, and a turn
 * that was interrupted or failed drops it. Permission prompts are spoken from
 * `tool.check`, because the turn stays suspended until the user answers.
 *
 * Playback is a one-shot `$.process.run` per utterance, chained so that a
 * permission prompt never talks over the sentence before it. A mod has no
 * handle on a running child, so a new announcement waits for the current one
 * instead of replacing it.
 */

import type { EngineInterface, Register } from "claude-code";

import type { Config } from "../src/core/config";
import { resolveConfig } from "../src/core/config";
import { instructions } from "../src/core/instructions";
import { cleanAbout, compose, isKind, permissionAbout, validate } from "../src/core/message";

/** Must match `name` in `.claude-plugin/plugin.json`: Claude calls `mcp__<plugin>__announce`. */
const PLUGIN = "voice-over";
const TOOL = "announce";
const FULL_TOOL = `mcp__${PLUGIN}__${TOOL}`;
const TIMEOUT_MS = 120_000;

const INPUT = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["finished", "question"],
      description: "Why the turn ends: work finished, or blocked on the user's answer.",
    },
    about: {
      type: "string",
      minLength: 2,
      maxLength: 120,
      description: "Short spoken noun phrase, e.g. 'the login redirect fix'.",
    },
  },
  required: ["kind", "about"],
  additionalProperties: false,
} as const;

type ToolSpecWithDeferral = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Keeps the tool out of deferred tool search, so Claude sees it on every turn. */
  isDeferred: boolean;
};

/** Utterances play in order; a failure never breaks the chain. */
let speaking: Promise<unknown> = Promise.resolve();

function debug($: EngineInterface, enabled: boolean, ...parts: unknown[]): void {
  if (!enabled) return;
  // 2.1.27x types `ui.log` as void; later builds return a promise that can reject.
  void Promise.resolve($.ui.log(`voice over: ${parts.map((part) => String(part)).join(" ")}`)).catch(
    () => {},
  );
}

function play($: EngineInterface, config: Config, enabled: boolean, text: string): void {
  speaking = speaking.catch(() => {}).then(async () => {
    const argv = config.input === "arg" ? [...config.command, text] : [...config.command];
    const init =
      config.input === "stdin" ? { stdin: text, timeoutMs: TIMEOUT_MS } : { timeoutMs: TIMEOUT_MS };
    try {
      await $.process.run(argv, init);
    } catch (error) {
      debug($, enabled, "playback failed", error instanceof Error ? error.message : error);
    }
  });
}

export const register: Register = (on, options) => {
  const config = resolveConfig(options as Readonly<Record<string, unknown>>, "claude");
  if (!config.enabled) return;

  const debugEnabled = options.debug === true;

  /** The phrase waiting for this turn to end. */
  let pending: string | undefined;

  on("session.start", async ($, event, next) => {
    await $.tool.register({
      name: TOOL,
      // The description is where Claude reads when to announce: a built-in guard
      // skips a user mod's prompt.compose hook on managed and Team sessions.
      description: instructions(config),
      inputSchema: INPUT,
      isDeferred: false,
    } as ToolSpecWithDeferral);
    debug($, debugEnabled, "ready", JSON.stringify(config));
    return next(event);
  });

  on("tool.call", { tool: FULL_TOOL }, async ($, event) => {
    const call = event as unknown as { kind?: unknown; about?: unknown; agentId?: string };
    debug($, debugEnabled, "tool call", call.kind, call.about);
    if (!isKind(call.kind) || typeof call.about !== "string") {
      return { result: 'NOT ANNOUNCED: pass kind "finished" or "question" and a short `about` phrase.' };
    }
    if (call.agentId !== undefined) {
      debug($, debugEnabled, "refused: child session");
      return { result: "NOT ANNOUNCED: child sessions do not announce; the parent turn will." };
    }

    const cleaned = cleanAbout(call.about);
    const text = compose(config.name, call.kind, cleaned);
    const problem = validate(cleaned, text, config);
    if (problem) {
      debug($, debugEnabled, "refused: validation", problem);
      return {
        result: `NOT ANNOUNCED: ${problem} Rewrite \`about\` as a shorter plain-language phrase and call \`announce\` again.`,
      };
    }

    pending = text;
    debug($, debugEnabled, "queued", text);
    return { result: `Announcement queued; it plays when this turn ends: "${text}"` };
  }).catch((_$, _event, _next) => ({
    result: "NOT ANNOUNCED: the voice-over mod failed; continue without speaking.",
  }));

  on("turn.complete", async ($, event, next) => {
    // A subagent's loop completes its own turn; only the main loop speaks.
    if (event.agentId !== undefined) return next(event);

    const text = pending;
    pending = undefined;
    if (text === undefined) return next(event);

    if (event.isAborted || (event.reason !== undefined && event.reason !== "answer")) {
      debug($, debugEnabled, "dropped", event.reason, text);
      return next(event);
    }

    debug($, debugEnabled, "speaking", text);
    play($, config, debugEnabled, text);
    return next(event);
  });

  on("tool.check", async ($, event, next) => {
    const decided = await next(event);
    const call = event as unknown as { tool: string; agentId?: string; tool_use_id?: string };
    // A query (no tool call) is not a prompt, and our own tool is not worth a sentence.
    if (decided.decision !== "ask" || call.tool_use_id === undefined) return decided;
    if (call.agentId !== undefined || call.tool === FULL_TOOL) return decided;

    const text = compose(config.name, "permission", permissionAbout(call.tool));
    debug($, debugEnabled, "permission prompt", call.tool, text);
    play($, config, debugEnabled, text);
    return decided;
  }).catch((_$, event, next) => next(event));
};
