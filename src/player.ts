/**
 * Plays announcements through an external command.
 *
 * The default is `pdg`, which streams audio from its first sentence, so the
 * speaker starts almost immediately. A new announcement replaces one that is
 * still playing: the freshest state is the useful one.
 */

import { spawn, type ChildProcess } from "node:child_process";

import type { Config } from "./core/config.js";

export class Player {
  private child: ChildProcess | undefined;

  constructor(private readonly config: Config) {}

  speak(text: string): void {
    this.stop();

    const [binary, ...fixed] = this.config.command;
    if (!binary) {
      console.error("[voice-over] no command configured");
      return;
    }
    const arguments_ = this.config.input === "arg" ? [...fixed, text] : fixed;

    let child: ChildProcess;
    try {
      child = spawn(binary, arguments_, {
        stdio: this.config.input === "stdin" ? ["pipe", "ignore", "pipe"] : ["ignore", "ignore", "pipe"],
        // Keep speaking if the server that spawned us exits right after the turn.
        detached: true,
      });
    } catch (error) {
      console.error(`[voice-over] cannot start ${binary}: ${error}`);
      return;
    }

    this.child = child;
    child.unref();

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4_000) stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (this.child === child) this.child = undefined;
      console.error(`[voice-over] ${binary} failed: ${error.message}`);
    });

    child.on("close", (code) => {
      if (this.child === child) this.child = undefined;
      if (code !== null && code !== 0 && !child.killed) {
        console.error(`[voice-over] ${binary} exited with ${code}: ${stderr.trim()}`);
      }
    });

    if (this.config.input === "stdin") {
      child.stdin?.on("error", () => {});
      child.stdin?.end(text);
    }
  }

  stop(): void {
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null) child.kill("SIGTERM");
  }
}
