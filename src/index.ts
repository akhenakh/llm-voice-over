import { appendFileSync } from "node:fs";

import { Plugin } from "@opencode/plugin";

import { resolveConfig } from "./config.js";
import { instructions, toolDescription } from "./instructions.js";
import { cleanAbout, compose, isKind, validate } from "./message.js";
import { Player } from "./player.js";

const TOOL = "announce";

/** Set VOICE_OVER_DEBUG=/path/to/file to trace the queue and playback boundary. */
const debugFile = process.env.VOICE_OVER_DEBUG;
const debug = debugFile
  ? (...parts: unknown[]) =>
      appendFileSync(debugFile, `${new Date().toISOString()} ${parts.map((part) => String(part)).join(" ")}\n`)
  : () => {};

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

export default Plugin.define({
  id: "voice-over",
  async setup(ctx) {
    const config = resolveConfig(ctx.options);
    debug("setup", JSON.stringify(config));
    if (!config.enabled) return;

    const player = new Player(config);
    /** Announcements waiting for their turn to end, keyed by session. */
    const pending = new Map<string, string>();
    /** Child sessions (subagents) never announce; the user did not start them. */
    const primary = new Map<string, boolean>();

    const isPrimary = async (sessionID: string): Promise<boolean> => {
      const known = primary.get(sessionID);
      if (known !== undefined) return known;
      try {
        const session = await ctx.session.get({ sessionID });
        const value = !session.parentID;
        primary.set(sessionID, value);
        debug("session", sessionID, value ? "primary" : `child of ${session.parentID}`);
        return value;
      } catch (error) {
        // Fail open: the tool is only reachable from a real session anyway.
        debug("session lookup failed", sessionID, error);
        return true;
      }
    };

    const onTurnEnd = (sessionID: string) => {
      const text = pending.get(sessionID);
      if (text === undefined) return;
      pending.delete(sessionID);
      debug("speaking", text);
      player.speak(text);
    };

    await ctx.tool.transform((editor) => {
      editor.add({
        name: TOOL,
        description: toolDescription(config),
        input: INPUT,
        execute: async (input, context) => {
          const { kind, about } = input as { kind?: unknown; about?: unknown };
          debug("tool call", context.sessionID, kind, about);
          if (!isKind(kind) || typeof about !== "string") {
            return { content: 'NOT ANNOUNCED: pass kind "finished" or "question" and a short `about` phrase.' };
          }
          if (!(await isPrimary(context.sessionID))) {
            debug("refused: child session", context.sessionID);
            return { content: "NOT ANNOUNCED: child sessions do not announce; the parent turn will." };
          }

          const cleaned = cleanAbout(about);
          const text = compose(config.name, kind, cleaned);
          const problem = validate(cleaned, text, config);
          if (problem) {
            debug("refused: validation", problem);
            return {
              content: `NOT ANNOUNCED: ${problem} Rewrite \`about\` as a shorter plain-language phrase and call \`announce\` again.`,
            };
          }

          pending.set(context.sessionID, text);
          debug("queued", context.sessionID, text);
          return { content: `Announcement queued; it plays when this turn ends: "${text}"` };
        },
      });
    });

    await ctx.session.hook("context", async (event) => {
      if (!(await isPrimary(event.sessionID))) {
        delete event.tools[TOOL];
        return;
      }
      event.system.push({ type: "text", text: instructions(config) });
    });

    const abort = new AbortController();
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) {
        switch (event.type) {
          case "session.execution.started":
          case "session.execution.failed":
          case "session.execution.interrupted":
            debug("event", event.type, event.data.sessionID);
            pending.delete(event.data.sessionID);
            break;

          case "session.execution.succeeded":
          case "session.idle": {
            const { sessionID } = event.data;
            debug("event", event.type, sessionID, pending.has(sessionID) ? "pending" : "nothing pending");
            onTurnEnd(sessionID);
            break;
          }
        }
      }
    })().catch((error) => {
      if (!abort.signal.aborted) console.error(`[voice-over] event stream failed: ${error}`);
    });

    return () => {
      abort.abort();
      player.stop();
    };
  },
});
