import { describe, expect, test } from "bun:test";

import { parsePromptRecord, promptShows, type PromptRecord } from "./prompt.js";

const SHOWN: PromptRecord = { mode: "default", tool: "Bash", fromAgent: false };

describe("parsePromptRecord", () => {
  test("reads the three fields the hook writes", () => {
    expect(parsePromptRecord("default\tBash\t")).toEqual({ mode: "default", tool: "Bash", fromAgent: false });
  });

  test("reads the agent that asked", () => {
    expect(parsePromptRecord("plan\tAgent\tagent-1")).toEqual({
      mode: "plan",
      tool: "Agent",
      fromAgent: true,
    });
  });

  test("ignores the newline the shell adds", () => {
    expect(parsePromptRecord("auto\tBash\t\n")).toEqual({ mode: "auto", tool: "Bash", fromAgent: false });
  });

  test("drops a record it cannot split or names no tool for", () => {
    expect(parsePromptRecord("")).toBeUndefined();
    expect(parsePromptRecord("prompt")).toBeUndefined();
    expect(parsePromptRecord("default\t")).toBeUndefined();
    expect(parsePromptRecord("default\tBash\t\ttrailing")).toBeUndefined();
  });
});

describe("promptShows", () => {
  test("speaks for a dialog the person answers", () => {
    expect(promptShows(SHOWN)).toBe(true);
    expect(promptShows({ ...SHOWN, mode: "acceptEdits" })).toBe(true);
    expect(promptShows({ ...SHOWN, mode: "plan" })).toBe(true);
  });

  test("stays quiet for the modes that answer the ask themselves", () => {
    for (const mode of ["auto", "dontAsk", "bypassPermissions"]) {
      expect(promptShows({ ...SHOWN, mode })).toBe(false);
    }
  });

  test("stays quiet when a subagent asks", () => {
    expect(promptShows({ ...SHOWN, fromAgent: true })).toBe(false);
  });

  test("stays quiet for a question, whose own dialog is the ask", () => {
    expect(promptShows({ ...SHOWN, tool: "AskUserQuestion" })).toBe(false);
    // Auto mode asks the same way, so both filters would keep it quiet.
    expect(promptShows({ mode: "auto", tool: "AskUserQuestion", fromAgent: false })).toBe(false);
  });
});
