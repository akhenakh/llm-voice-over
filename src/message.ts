/**
 * Turn-end announcements are spoken, not displayed, so the text has to read
 * well through a TTS engine. The LLM picks a kind and a short `about` phrase;
 * the plugin owns the fixed wording from the notification templates.
 */

import type { Config } from "./config.js";

export type Kind = "finished" | "question";

const TEMPLATE: Record<Kind, string> = {
  finished: "finished work on",
  question: "question about",
};

/** Code, paths and identifiers do not read well out loud. */
const SPEECH_UNFRIENDLY = /[`\\/{}<>_|]/;
const MAX_TOKEN = 24;

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

export function compose(name: string, kind: Kind, about: string): string {
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
