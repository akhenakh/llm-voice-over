/**
 * Turn-end announcements are spoken, not displayed, so the text has to read
 * well through a TTS engine. The LLM picks a kind and a short `about` phrase;
 * the plugin owns the fixed wording from the notification templates.
 */

import type { Config } from "./config.js";

export type Kind = "finished" | "question";

/** The model picks the first two; the plugin speaks permission prompts itself. */
export type SpokenKind = Kind | "permission";

const TEMPLATE: Record<SpokenKind, string> = {
  finished: "finished work on",
  question: "question about",
  permission: "needs permission to",
};

/** Permission asks, as the event or hook reports them. */
export interface PermissionAsk {
  action: string;
  /** Shell commands for shell asks; file paths, patterns, or URLs otherwise. */
  resources?: readonly string[];
}

/** Permission actions, as plain verb phrases that read well out loud. */
const ACTION: Record<string, string> = {
  // OpenCode action names.
  shell: "run a command",
  edit: "edit files",
  read: "read files",
  glob: "search the project",
  grep: "search the project",
  webfetch: "fetch a web page",
  websearch: "search the web",
  browser: "use the browser",
  question: "ask a question",
  agent: "start a subagent",
  // Claude Code tool names.
  Bash: "run a command",
  Edit: "edit files",
  Write: "write files",
  NotebookEdit: "edit files",
  Read: "read files",
  Glob: "search the project",
  Grep: "search the project",
  WebFetch: "fetch a web page",
  WebSearch: "search the web",
  Agent: "start a subagent",
  Task: "start a subagent",
  AskUserQuestion: "ask a question",
  Skill: "use a skill",
};

/** Shell asks, where the resources are the commands themselves. */
const SHELL_ACTIONS = new Set(["shell", "Bash"]);

/** `a && b`, `a || b`, `a ; b`, `a | b`, `a & b`, or one command per line. */
const COMMAND_SEPARATOR = /[;&|\n]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** Prefixes that run another program; the spoken name is the one after them. */
const WRAPPER = new Set(["sudo", "env", "command", "time", "nohup", "exec"]);
/** Directory changes are not worth naming, and their path must not be read. */
const CWD = new Set(["cd", "chdir", "pushd", "popd", "push-location", "set-location"]);
/**
 * Keywords that end a block or open one: the line names no program of its own.
 * A loop splits into its header (`for f in *.txt`, `case "$x" in`) and its
 * closer (`done`, `fi`, `esac`), with the commands in the body between them.
 */
const BLOCK = new Set(["for", "select", "case", "function", "done", "fi", "esac"]);
/** Keywords that introduce the command that follows on the same line. */
const BLOCK_BODY = new Set(["do", "then", "else", "elif", "if", "while", "until"]);

/**
 * Code, paths and identifiers do not read well out loud. Program names are an
 * exception: the shell ask names the commands it needs.
 */
const SPEECH_UNFRIENDLY = /[`\\/{}<>_|]/;
const MAX_TOKEN = 24;
const SPEAKABLE_PROGRAM = /^[A-Za-z0-9][A-Za-z0-9.+@-]*$/;
/** Past a few names the sentence stops being a notification. */
const MAX_PROGRAMS = 3;

/**
 * The programs a set of shell resources runs, e.g. `["grep", "python"]`.
 * Sorted and deduplicated: a pipeline and a chain both end up as one list.
 */
function shellPrograms(resources: readonly string[]): string[] {
  const found = new Map<string, string>();
  for (const resource of resources) {
    for (const piece of commandLines(resource)) {
      const program = programName(piece);
      if (!program) continue;
      const key = program.toLowerCase();
      if (!found.has(key)) found.set(key, program);
    }
  }
  return [...found.values()].sort(byName);
}

/** Deterministic, case-insensitive order that does not depend on the locale. */
function byName(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Splits a shell line on its operators, ignoring the ones inside quotes. */
function commandLines(resource: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quote: string | undefined;

  for (let index = 0; index < resource.length; index += 1) {
    const char = resource[index]!;
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (COMMAND_SEPARATOR.test(char)) {
      lines.push(current);
      current = "";
      if ((char === "|" || char === "&") && resource[index + 1] === char) index += 1;
      continue;
    }
    current += char;
  }

  lines.push(current);
  return lines;
}

/** The program a single command line runs, or undefined when it is not clear. */
function programName(piece: string): string | undefined {
  const tokens = piece
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Quotes around a program name are not part of its name.
    .map((token) => token.replace(/^['"]|['"]$/g, ""));

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    const keyword = token.toLowerCase();
    // A loop's header and closer are syntax; only its body runs a program.
    if (BLOCK.has(keyword)) return undefined;
    if (BLOCK_BODY.has(keyword) || ASSIGNMENT.test(token) || WRAPPER.has(token)) {
      index += 1;
      continue;
    }
    break;
  }

  const token = tokens[index];
  if (!token || token.startsWith("-")) return undefined;
  // `/usr/bin/python3` and `C:\Python\python.exe` both read as `python3`/`python.exe`.
  const base = token.split(/[\\/]/).pop() ?? token;
  if (!base || base.length > MAX_TOKEN || !SPEAKABLE_PROGRAM.test(base)) return undefined;
  if (CWD.has(base.toLowerCase())) return undefined;
  return base;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Sorted program names, capped so the sentence stays short. */
function spokenPrograms(programs: string[]): string {
  const truncated = programs.length > MAX_PROGRAMS;
  // "and more" takes the last slot, so the first sentence stays within budget.
  const shown = programs.slice(0, truncated ? MAX_PROGRAMS - 1 : MAX_PROGRAMS);
  if (truncated) shown.push("more");
  return joinList(shown);
}

/**
 * The action is usually a tool name, but users can configure their own
 * permission patterns. A shell ask names the commands it needs; unknown
 * actions stay generic instead of being read out.
 */
export function permissionAbout(action: string, resources: readonly string[] = []): string {
  if (SHELL_ACTIONS.has(action)) {
    const programs = shellPrograms(resources);
    if (programs.length > 0) return `run ${spokenPrograms(programs)}`;
  }
  return ACTION[action] ?? "continue";
}

/**
 * The phrases of a burst: parallel tool calls each ask separately, but the user
 * hears a single sentence listing the distinct commands and actions. Different
 * actions can read the same out loud (`Glob` and `Grep` both search the
 * project), so the phrases are deduplicated too.
 */
function permissionParts(asks: readonly PermissionAsk[]): string[] {
  const merged = new Map<string, string[]>();
  for (const ask of asks) {
    const resources = merged.get(ask.action) ?? [];
    resources.push(...(ask.resources ?? []));
    merged.set(ask.action, resources);
  }

  const parts = new Map<string, string>();
  for (const [action, resources] of [...merged].sort(([left], [right]) => byName(left, right))) {
    const phrase = permissionAbout(action, resources);
    const key = phrase.toLowerCase();
    if (!parts.has(key)) parts.set(key, phrase);
  }
  return [...parts.values()];
}

/** Spoken when a burst is too long to name even its first ask. */
const PERMISSION_FALLBACK = "continue";
/** Signals on screen that other asks did not fit the sentence. */
const MORE = "more";

/**
 * The sentence for a burst of permission asks, e.g.
 * `opencode: needs permission to run grep and python`. Permission prompts are
 * spoken while the dialog is on screen, so the sentence must fit the
 * first-sentence budget: a burst that does not fit names the asks that do and
 * ends with "and more", rather than holding the audio back.
 */
export function permissionText(
  name: string,
  asks: readonly PermissionAsk[],
  config: Config,
): string {
  const parts = permissionParts(asks);
  const fits = (about: string): boolean =>
    validate(about, compose(name, "permission", about), config) === undefined;

  const full = joinList(parts);
  if (full && fits(full)) return compose(name, "permission", full);

  const shown: string[] = [];
  for (const part of parts) {
    if (!fits(joinList([...shown, part, MORE]))) break;
    shown.push(part);
  }
  if (shown.length === 0) return compose(name, "permission", PERMISSION_FALLBACK);
  return compose(name, "permission", joinList([...shown, MORE]));
}

/** Spoken when a question dialog's headers cannot be read out as written. */
const QUESTION_FALLBACK = "a decision";

/**
 * The sentence for a question dialog, e.g. `claude: question about DuckDB`.
 * The dialog's short headers name it; the questions themselves are too long to
 * stream quickly, and a header that is not speakable falls back to a generic
 * phrase rather than silence.
 */
export function questionText(name: string, input: unknown, config: Config): string {
  const questions = (input as { questions?: unknown } | undefined)?.questions;
  const headers = new Map<string, string>();
  if (Array.isArray(questions)) {
    for (const question of questions) {
      const header = (question as { header?: unknown } | undefined)?.header;
      if (typeof header !== "string") continue;
      const cleaned = cleanAbout(header);
      const key = cleaned.toLowerCase();
      if (cleaned && !headers.has(key)) headers.set(key, cleaned);
    }
  }

  const about = cleanAbout(joinList([...headers.values()]));
  const text = compose(name, "question", about);
  if (about && validate(about, text, config) === undefined) return text;
  return compose(name, "question", QUESTION_FALLBACK);
}

export function isKind(value: unknown): value is Kind {
  return value === "finished" || value === "question";
}

/** Collapse whitespace and drop trailing punctuation that TTS does not need. */
export function cleanAbout(about: string): string {
  return about
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!]+$/, "");
}

export function compose(name: string, kind: SpokenKind, about: string): string {
  const phrase = `${TEMPLATE[kind]} ${cleanAbout(about)}`;
  return name ? `${name}: ${phrase}` : phrase;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return match ? match[0] : text;
}

/**
 * Returns a reason when the announcement cannot be spoken as written, or
 * `undefined` when it is acceptable.
 */
export function validate(about: string, utterance: string, config: Config): string | undefined {
  if (!about) return '`about` is empty.';

  if (SPEECH_UNFRIENDLY.test(about)) {
    return '`about` contains code, a path, or an underscore; rewrite it as plain spoken words.';
  }

  const long = words(about).find((word) => word.length > MAX_TOKEN);
  if (long) {
    return `\`about\` contains the long token "${long}"; describe it in plain words instead.`;
  }

  const total = words(utterance).length;
  if (total > config.maxWords) {
    return `the announcement is ${total} words; the limit is ${config.maxWords}.`;
  }

  const opening = words(firstSentence(utterance)).length;
  if (opening > config.maxFirstSentenceWords) {
    return `the first sentence is ${opening} words; the limit is ${config.maxFirstSentenceWords} because TTS streams audio after it.`;
  }

  return undefined;
}
