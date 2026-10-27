import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDebug } from "./debug.js";

const directory = mkdtempSync(join(tmpdir(), "voice-over-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("createDebug", () => {
  test("writes one line per call", () => {
    const file = join(directory, "trace.log");
    createDebug(file)("setup", "/work", '{"enabled":true}');
    expect(readFileSync(file, "utf8")).toMatch(/^\S+ setup \/work \{"enabled":true\}\n$/);
  });

  test("stays silent without a file", () => {
    const failures: unknown[] = [];
    const debug = createDebug(undefined, (error) => failures.push(error));
    expect(() => debug("setup")).not.toThrow();
    expect(failures).toEqual([]);
  });

  test("disables itself after the first failed write", () => {
    const failures: unknown[] = [];
    const debug = createDebug(join(directory, "missing", "trace.log"), (error) =>
      failures.push(error),
    );

    expect(() => debug("setup")).not.toThrow();
    expect(() => debug("event")).not.toThrow();
    expect(failures).toHaveLength(1);
    expect(existsSync(join(directory, "missing"))).toBe(false);
  });
});
