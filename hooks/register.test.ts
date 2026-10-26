/**
 * Runs under `claude plugin test`, which loads the mod and fires events through
 * its hooks. Plain `bun test` cannot run this file: `claude-code/testing` only
 * resolves inside Claude Code.
 */

import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const TOOL = "mcp__voice-over__announce";
/** Where the mod and `hooks/permission.sh` meet for the test's session. */
const PROMPT_SIGNAL = "/tmp/voice-over-permission-session-1";

type Run = { argv: readonly string[]; init?: { stdin?: string; timeoutMs?: number } };

/** Stubs Claude Code's answers, and records what the mod registers and runs. */
function harness(on: On) {
  const runs: Run[] = [];
  const registered: { name: string; description: string }[] = [];
  const files = new Map<string, string>();
  const clock = mock.clock(on);
  mock.env(on, { TMPDIR: "/tmp" });
  on("session.start", () => ({ cwd: "/work" }));
  on("session.id", () => ({ value: "session-1" }));
  on("tool.register", (_$, event) => {
    registered.push({ name: event.name, description: event.description });
    return { value: { tool: TOOL } };
  });
  on("ui.log", () => ({ value: undefined }));
  on("turn.complete", () => ({ text: "" }));
  on("fs.write", (_$, event) => {
    files.set(event.path, event.text);
    return { value: undefined };
  });
  on("fs.read", (_$, event) => {
    const text = files.get(event.path);
    return text === undefined ? { deny: "missing" } : { value: text };
  });
  on("process.run", (_$, event) => {
    runs.push({ argv: event.argv, init: event.init });
    return { value: { exitCode: 0, stdout: "", stderr: "" } };
  });
  return { runs, registered, files, clock };
}

/** Playback is chained, so give the queue every microtask it needs. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

test("speaks a finished turn once it ends", async ($, on) => {
  const { runs } = harness(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const queued = await $.tool.call({ tool: TOOL, kind: "finished", about: "the login redirect fix" });
  expect(queued.result).toContain("queued");
  expect(runs).toEqual([]);

  await $.turn.complete({ turnId: "t1", answer: "Done.", durationMs: 10, isAborted: false, reason: "answer" });
  await settle();

  expect(runs).toEqual([
    { argv: ["pdg", "claude: finished work on the login redirect fix"], init: { timeoutMs: 120_000 } },
  ]);
});

test("drops the announcement when the turn is interrupted", async ($, on) => {
  const { runs } = harness(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: TOOL, kind: "finished", about: "the migration and its tests" });
  await $.turn.complete({ turnId: "t1", answer: "", durationMs: 10, isAborted: true, reason: "aborted" });
  await settle();

  expect(runs).toEqual([]);
});

test("refuses code and paths in the spoken phrase", async ($, on) => {
  const { runs } = harness(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const refused = await $.tool.call({ tool: TOOL, kind: "finished", about: "src/auth.ts" });
  expect(refused.result).toContain("NOT ANNOUNCED");
  await $.turn.complete({ turnId: "t1", answer: "", durationMs: 10, isAborted: false, reason: "answer" });
  await settle();

  expect(runs).toEqual([]);
});

test("subagents never announce and never speak", async ($, on) => {
  const { runs } = harness(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const refused = await $.tool.call({
    tool: TOOL,
    kind: "finished",
    about: "the login redirect fix",
    agentId: "agent-1",
  });
  expect(refused.result).toContain("NOT ANNOUNCED");

  await $.turn.complete({
    turnId: "t1",
    answer: "",
    durationMs: 10,
    isAborted: false,
    reason: "answer",
    agentId: "agent-1",
  });
  await settle();

  expect(runs).toEqual([]);
});

test("speaks a permission prompt once the dialog is really shown", async ($, on) => {
  const { runs, files, clock } = harness(on);
  on("tool.check", () => ({ decision: "ask" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const decided = await $.tool.check({ tool: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" });
  expect(decided.decision).toBe("ask");
  await clock.advance(200);
  await settle();
  expect(runs).toEqual([]);

  // The classic `PermissionRequest` hook records the prompt the engine shows.
  files.set(PROMPT_SIGNAL, "prompt");
  await clock.advance(200);
  await settle();
  // Asks are collected for a moment before they are spoken.
  await clock.advance(150);
  await settle();

  expect(runs).toEqual([
    { argv: ["pdg", "claude: needs permission to run ls"], init: { timeoutMs: 120_000 } },
  ]);
});

test("speaks parallel permission prompts as one sentence", async ($, on) => {
  const { runs, files, clock } = harness(on);
  on("tool.check", () => ({ decision: "ask" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.check({ tool: "Bash", input: { command: "python plot.py" }, tool_use_id: "toolu_1" });
  await $.tool.check({ tool: "Bash", input: { command: "grep -r foo ." }, tool_use_id: "toolu_2" });

  files.set(PROMPT_SIGNAL, "prompt");
  await clock.advance(200);
  await settle();
  await clock.advance(150);
  await settle();

  expect(runs).toEqual([
    { argv: ["pdg", "claude: needs permission to run grep and python"], init: { timeoutMs: 120_000 } },
  ]);
});

test("stays silent when the permission mode answers the ask itself", async ($, on) => {
  const { runs, files, clock } = harness(on);
  on("tool.check", () => ({ decision: "ask" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  // Auto mode resolves the ask without a dialog, so no record appears.
  await $.tool.check({ tool: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" });
  expect(files.get(PROMPT_SIGNAL)).toBe("");
  await clock.advance(2000);
  await settle();

  expect(runs).toEqual([]);
});

test("stays silent when a tool check is not a prompt", async ($, on) => {
  const { runs, files, clock } = harness(on);
  on("tool.check", () => ({ decision: "allow" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.check({ tool: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" });
  await $.tool.check({ tool: "Bash", input: { command: "ls" } });
  files.set(PROMPT_SIGNAL, "prompt");
  await clock.advance(2000);
  await settle();

  expect(runs).toEqual([]);
});

test("tells Claude when to announce in the tool description", async ($, on) => {
  const { registered } = harness(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });

  expect(registered).toHaveLength(1);
  expect(registered[0]?.name).toBe("announce");
  expect(registered[0]?.description).toContain("Announce the end of a turn");
  expect(registered[0]?.description).toContain("the login redirect fix");
});
