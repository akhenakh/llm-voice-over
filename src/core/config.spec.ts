import { describe, expect, test } from "bun:test";

import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  test("defaults to pdg", () => {
    expect(resolveConfig({})).toEqual({
      name: "opencode",
      command: ["pdg"],
      input: "arg",
      maxWords: 20,
      maxFirstSentenceWords: 9,
      enabled: true,
    });
  });

  test("takes the platform default name", () => {
    expect(resolveConfig({}, "claude").name).toBe("claude");
    expect(resolveConfig({ name: "agent" }, "claude").name).toBe("agent");
  });

  test("accepts another command as an array or a string", () => {
    expect(resolveConfig({ command: ["espeak-ng", "-s", "160"] }).command).toEqual([
      "espeak-ng",
      "-s",
      "160",
    ]);
    expect(resolveConfig({ command: "say -r 180" }).command).toEqual(["say", "-r", "180"]);
  });

  test("supports stdin delivery and disabling the prefix", () => {
    const config = resolveConfig({ input: "stdin", name: " " });
    expect(config.input).toBe("stdin");
    expect(config.name).toBe("");
  });

  test("ignores invalid values", () => {
    const config = resolveConfig({
      command: [],
      maxWords: -3,
      maxFirstSentenceWords: "many",
      enabled: false,
    });
    expect(config.command).toEqual(["pdg"]);
    expect(config.maxWords).toBe(20);
    expect(config.maxFirstSentenceWords).toBe(9);
    expect(config.enabled).toBe(false);
  });
});
