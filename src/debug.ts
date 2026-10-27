/**
 * The OpenCode plugin's trace log: `VOICE_OVER_DEBUG` names the file.
 *
 * The log is a diagnostic, so it must never take the plugin down with it. A
 * write that fails — a missing directory, a read-only path — disables the log
 * for the rest of the process and is reported once, instead of throwing from
 * setup or from inside the event loop.
 */

import { appendFileSync } from "node:fs";

export function createDebug(
  file: string | undefined,
  onFailure: (error: unknown) => void = () => {},
): (...parts: unknown[]) => void {
  let broken = false;
  return (...parts) => {
    if (!file || broken) return;
    try {
      appendFileSync(
        file,
        `${new Date().toISOString()} ${parts.map((part) => String(part)).join(" ")}\n`,
      );
    } catch (error) {
      broken = true;
      onFailure(error);
    }
  };
}
