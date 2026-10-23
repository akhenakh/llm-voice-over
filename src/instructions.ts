import type { Config } from "./config.js";

/**
 * Injected into the system prompt for primary sessions only. This is where the
 * model learns *when* a turn is worth announcing and *how* to keep the text
 * short enough to start streaming quickly.
 */
export function instructions(config: Config): string {
  return `## Spoken turn announcements

The user is often away from the screen while you work. The \`announce\` tool speaks the end of a turn out loud.

Default to announcing. Call \`announce\` once, as your last action before the final message, when the turn did real work and ends with the task complete or the question answered: files changed, commands run, research done, a substantive answer given. If the user stepped away for this turn, they should hear it end.

Use kind \`question\` when the turn ends because you are blocked on the user's answer and cannot continue without it.

Skip the announcement only when:
- you ask a question in the middle of the work and then keep going; finish what you can first;
- you reach a milestone or the end of a phase of a larger task, not the end of the task;
- a long command, build, or background task you started earlier is still running; announce when the turn that consumes its result ends;
- the turn is a one-line answer or a trivial lookup the user is likely watching.

Write \`about\` as a short noun phrase for speech: 2 to 7 plain words, no code, file paths, versions, identifiers, or punctuation. TTS streams audio once the first sentence is ready, so the first sentence must stay under ${config.maxFirstSentenceWords} words and the whole announcement under ${config.maxWords}. Shorter is better. The plugin rejects longer text; rewrite it shorter and call \`announce\` again.

Examples:
- \`finished\` / "the login redirect fix"
- \`finished\` / "the migration and its tests"
- \`question\` / "which database to target"`;
}

export function toolDescription(config: Config): string {
  return `Announce the end of this turn out loud through the user's TTS. Call it once, as the last action, when the turn did real work and ends with the task complete, or when you are blocked on the user's answer. Skip mid-task questions, phase milestones, trivial turns, and turns that end while a background task you started is still running. \`about\` is a 2-7 word plain-language noun phrase with no code or paths; the first sentence must stay under ${config.maxFirstSentenceWords} words and the whole announcement under ${config.maxWords}.`;
}
