/**
 * Runs under `claude plugin test`, which loads the mod and fires events through
 * its hooks. Plain `bun test` cannot run this file: `claude-code/testing` only
 * resolves inside Claude Code.
 */

import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const TOOL = "mcp__voice-over__announce";

type Run = { argv: readonly string[]; init?: { stdin?: string; timeoutMs?: number } };

/** Stubs Claude Code's answers, and records what the mod registers and runs. */
function harness(on: On) {
  const runs: Run[] = [];
  const registered: { name: string; description: string }[] = [];
  on("session.start", () => ({ cwd: "/work" }));
  on("tool.register", (_$, event) => {
    registered.push({ name: event.name, description: event.description });
    return { value: { tool: TOOL } };
  });
  on("ui.log", () => ({ value: undefined }));
  on("turn.complete", () => ({ text: "" }));
  on("process.run", (_$, event) => {
    runs.push({ argv: event.argv, init: event.init });
    return { value: { exitCode: 0, stdout: "", stderr: "" } };
  });
  return { runs, registered };
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

test("speaks a permission prompt as it appears", async ($, on) => {
  const { runs } = harness(on);
  on("tool.check", () => ({ decision: "ask" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const decided = await $.tool.check({ tool: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" });
  expect(decided.decision).toBe("ask");
  await settle();

  expect(runs).toEqual([
    { argv: ["pdg", "claude: needs permission to run a command"], init: { timeoutMs: 120_000 } },
  ]);
});

test("stays silent when a tool check is not a prompt", async ($, on) => {
  const { runs } = harness(on);
  on("tool.check", () => ({ decision: "allow" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.check({ tool: "Bash", input: { command: "ls" }, tool_use_id: "toolu_1" });
  await $.tool.check({ tool: "Bash", input: { command: "ls" } });
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
