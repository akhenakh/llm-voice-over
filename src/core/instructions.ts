import type { Config } from "./config.js";

/**
 * The policy that tells the model when a turn is worth announcing and how to
 * keep the text short enough to start streaming quickly. OpenCode injects it
 * into the system prompt of primary sessions; Claude Code ships it as the
 * `announce` tool's description.
 */
export function instructions(config: Config): string {
  return `## Spoken turn announcements

The user is often away from the screen while you work. The \`announce\` tool speaks the end of a turn out loud.

Announce the end of a turn when the user has a reason to come back:
- the requested work is done: files changed, commands run, research completed, the task delivered;
- you answered a question or finished a lookup the user asked for, however short the answer;
- you cannot continue without the user's answer, and the turn ends waiting for them (kind \`question\`);
- a long command, build, or background task you started earlier has finished and you are reporting its result.

Do not announce:
- an intermediate milestone or the end of a phase of a larger task; announce when the task is actually done;
- a turn that ends while a long task is still running; announce the turn that consumes its result;
- a question you ask and then keep working past;
- a permission prompt or a question dialog: the plugin speaks those itself the moment they appear.

Write \`about\` as a short noun phrase for speech: 2 to 7 plain words, no code, file paths, versions, identifiers, or punctuation. TTS streams audio once the first sentence is ready, so the first sentence must stay at most ${config.maxFirstSentenceWords} words and the whole announcement at most ${config.maxWords} words. Shorter is better. The plugin rejects longer text; rewrite it shorter and call \`announce\` again.

Examples:
- \`finished\` / "the login redirect fix"
- \`finished\` / "the migration and its tests"
- \`finished\` / "the build finished"
- \`question\` / "which database to target"`;
}

export function toolDescription(config: Config): string {
  return `Announce the end of this turn out loud when the user has a reason to come back: the task is done, you answered a question however short, you are blocked on their answer, or a long task you started earlier has finished. Skip phase milestones, mid-work questions, permission prompts (the plugin speaks those itself), and turns that end while a long task is still running. \`about\` is a 2-7 word plain-language noun phrase with no code or paths; the first sentence must stay at most ${config.maxFirstSentenceWords} words and the whole announcement at most ${config.maxWords} words.`;
}
