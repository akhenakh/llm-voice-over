import { describe, expect, test } from "bun:test";

import type { Config } from "./config.js";
import { cleanAbout, compose, isKind, permissionAbout, permissionPhrases, validate } from "./message.js";

const config: Config = {
  name: "opencode",
  command: ["pdg"],
  input: "arg",
  maxWords: 20,
  maxFirstSentenceWords: 9,
  enabled: true,
};

describe("compose", () => {
  test("uses the notification templates", () => {
    expect(compose("opencode", "finished", "the login redirect fix")).toBe(
      "opencode: finished work on the login redirect fix",
    );
    expect(compose("opencode", "question", "which database to target")).toBe(
      "opencode: question about which database to target",
    );
  });

  test("omits the prefix when the name is empty", () => {
    expect(compose("", "finished", "the build")).toBe("finished work on the build");
  });

  test("speaks permission prompts from the action", () => {
    expect(compose("opencode", "permission", permissionAbout("shell"))).toBe(
      "opencode: needs permission to run a command",
    );
    expect(compose("opencode", "permission", permissionAbout("edit"))).toBe(
      "opencode: needs permission to edit files",
    );
  });

  test("names the commands a shell prompt runs", () => {
    expect(compose("opencode", "permission", permissionAbout("shell", ["python plot.py"]))).toBe(
      "opencode: needs permission to run python",
    );
    expect(
      compose("opencode", "permission", permissionAbout("shell", ["grep -r foo src", "python3 -m http"])),
    ).toBe("opencode: needs permission to run grep and python3");
  });
});

describe("permissionAbout", () => {
  test("maps known actions to plain verb phrases", () => {
    expect(permissionAbout("read")).toBe("read files");
    expect(permissionAbout("webfetch")).toBe("fetch a web page");
  });

  test("stays generic for user-defined actions", () => {
    expect(permissionAbout("mcp__github__*")).toBe("continue");
  });

  test("sorts and deduplicates the commands of a pipeline", () => {
    expect(permissionAbout("shell", ["grep -r foo src | python3 filter.py", "python3 other.py"])).toBe(
      "run grep and python3",
    );
  });

  test("reads through command wrappers and paths", () => {
    expect(permissionAbout("shell", ["FOO=1 /usr/bin/python3 plot.py", "sudo apt install ripgrep"])).toBe(
      "run apt and python3",
    );
  });

  test("ignores separators inside quotes", () => {
    expect(permissionAbout("shell", [`grep -r "a|b" .`])).toBe("run grep");
  });

  test("stays generic when the command cannot be named", () => {
    expect(permissionAbout("shell", ["$RUNNER --fast"])).toBe("run a command");
  });

  test("caps the list so the sentence stays short", () => {
    const commands = ["alpha x", "bravo x", "charlie x", "delta x"];
    expect(permissionAbout("shell", commands)).toBe("run alpha, bravo and more");
  });

  test("names the command of a Claude Code bash check", () => {
    expect(permissionAbout("Bash", ["npm test"])).toBe("run npm");
  });

  test("does not read a directory change out loud", () => {
    expect(permissionAbout("Bash", ["cd /home/akh/dev && python plot.py"])).toBe("run python");
  });
});

describe("permissionPhrases", () => {
  test("speaks a burst of asks as one sentence", () => {
    expect(
      permissionPhrases([
        { action: "shell", resources: ["python plot.py"] },
        { action: "shell", resources: ["grep -r foo ."] },
        { action: "edit", resources: ["src/index.ts"] },
      ]),
    ).toBe("edit files and run grep and python");
  });

  test("falls back to a generic request when nothing is known", () => {
    expect(permissionPhrases([])).toBe("continue");
  });
});

describe("isKind", () => {
  test("accepts only the kinds the model may pass", () => {
    expect(isKind("finished")).toBe(true);
    expect(isKind("question")).toBe(true);
    expect(isKind("permission")).toBe(false);
  });
});

describe("cleanAbout", () => {
  test("collapses whitespace and drops trailing punctuation", () => {
    expect(cleanAbout("  the   migration, and its tests.  ")).toBe("the migration, and its tests");
  });
});

describe("validate", () => {
  const check = (about: string) => validate(about, compose("opencode", "finished", about), config);

  test("accepts a short spoken phrase", () => {
    expect(check("the login redirect fix")).toBeUndefined();
  });

  test("rejects code, paths and underscores", () => {
    expect(check("the src/index.ts change")).toContain("code, a path");
    expect(check("the user_id rename")).toContain("code, a path");
  });

  test("rejects a long first sentence", () => {
    const reason = check("the login redirect fix and the two failing tests that came with it");
    expect(reason).toContain("first sentence");
  });

  test("accepts a short first sentence followed by a second one", () => {
    const about = "the login fix. All tests pass";
    expect(validate(about, compose("opencode", "finished", about), config)).toBeUndefined();
  });

  test("rejects an announcement over the total word limit", () => {
    const tight = { ...config, maxWords: 6 };
    expect(validate("the login fix", compose("opencode", "finished", "the login fix"), tight)).toContain(
      "the limit is 6",
    );
  });

  test("rejects a single absurdly long token", () => {
    expect(check("Supercalifragilisticexpialidocious refactor")).toContain("long token");
  });
});
