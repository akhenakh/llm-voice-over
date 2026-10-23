import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Config } from "./config.js";
import { Player } from "./player.js";

const directory = mkdtempSync(join(tmpdir(), "voice-over-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const base: Config = {
  name: "opencode",
  command: ["pdg"],
  input: "arg",
  maxWords: 20,
  maxFirstSentenceWords: 9,
  enabled: true,
};

async function waitFor(
  path: string,
  done: (content: string) => boolean = () => true,
  timeout = 2_000,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf8");
      if (done(content)) return content;
    }
    await Bun.sleep(20);
  }
  throw new Error(`timed out waiting for ${path}`);
}

describe("Player", () => {
  test("passes the announcement as the last argument", async () => {
    const out = join(directory, "arg.txt");
    const player = new Player({
      ...base,
      command: ["sh", "-c", `printf %s "$1" > ${out}`, "sh"],
    });
    player.speak("opencode: finished work on the build");
    expect(await waitFor(out)).toBe("opencode: finished work on the build");
    player.stop();
  });

  test("can pipe the announcement to stdin", async () => {
    const out = join(directory, "stdin.txt");
    const player = new Player({ ...base, command: ["sh", "-c", `cat > ${out}`], input: "stdin" });
    player.speak("opencode: question about the database");
    expect(await waitFor(out, (content) => content.length > 0)).toBe(
      "opencode: question about the database",
    );
    player.stop();
  });

  test("replaces a playing announcement", async () => {
    const out = join(directory, "replace.txt");
    const player = new Player({
      ...base,
      command: ["sh", "-c", `printf '%s\\n' "$1" >> ${out}; exec sleep 5`, "sh"],
    });
    player.speak("first");
    await waitFor(out);
    player.speak("second");
    expect(await waitFor(out, (content) => content.includes("second"))).toBe("first\nsecond\n");
    player.stop();
  });

  test.skipIf(!Bun.which("pdg"))("synthesizes through pdg", async () => {
    const wav = join(directory, "speech.wav");
    const player = new Player({ ...base, command: ["pdg", "-quiet", "-o", wav] });
    player.speak("opencode: finished work on the build");
    expect((await waitFor(wav, () => true, 5_000)).slice(0, 4)).toBe("RIFF");
    player.stop();
  });
});
