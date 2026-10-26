/**
 * Plugin options, shared by the OpenCode plugin and the Claude Code plugin.
 *
 * Everything is optional. The defaults target `pdg`, but any command that
 * accepts text on argv or stdin can be used instead.
 */

export interface Config {
  /** Spoken prefix, e.g. `opencode: finished work on ...`. Empty disables it. */
  name: string;
  /** Command and fixed arguments. The announcement is appended (or piped). */
  command: string[];
  /** How the announcement reaches the command. */
  input: "arg" | "stdin";
  /** Maximum words for the whole announcement. */
  maxWords: number;
  /** Maximum words in the first sentence; TTS starts streaming after it. */
  maxFirstSentenceWords: number;
  /** Set to false to load the plugin without registering anything. */
  enabled: boolean;
}

const DEFAULTS: Config = {
  name: "opencode",
  command: ["pdg"],
  input: "arg",
  maxWords: 20,
  maxFirstSentenceWords: 9,
  enabled: true,
};

function command(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value.filter((part): part is string => typeof part === "string" && part.length > 0);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function resolveConfig(
  options: Readonly<Record<string, unknown>>,
  defaultName: string = DEFAULTS.name,
): Config {
  const name = typeof options.name === "string" ? options.name.trim() : defaultName;
  return {
    name,
    command: command(options.command) ?? [...DEFAULTS.command],
    input: options.input === "stdin" ? "stdin" : DEFAULTS.input,
    maxWords: positiveInteger(options.maxWords, DEFAULTS.maxWords),
    maxFirstSentenceWords: positiveInteger(
      options.maxFirstSentenceWords,
      DEFAULTS.maxFirstSentenceWords,
    ),
    enabled: options.enabled !== false,
  };
}
