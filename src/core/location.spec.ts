import { describe, expect, test } from "bun:test";

import { canonicalDirectory, sameDirectory } from "./location.js";

describe("sameDirectory", () => {
  test("matches the same directory", () => {
    expect(sameDirectory("/home/akh/dev/llm-voice-over", "/home/akh/dev/llm-voice-over")).toBe(true);
  });

  test("ignores a trailing separator", () => {
    expect(sameDirectory("/home/akh/dev/llm-voice-over/", "/home/akh/dev/llm-voice-over")).toBe(true);
    expect(sameDirectory("/home/akh/dev/llm-voice-over//", "/home/akh/dev/llm-voice-over")).toBe(true);
  });

  test("keeps a sibling or a parent apart", () => {
    expect(sameDirectory("/home/akh/dev/websites", "/home/akh/dev/websites/www")).toBe(false);
    expect(sameDirectory("/home/akh/dev", "/home/akh/dev/websites")).toBe(false);
  });

  test("does not treat a shared prefix as a location", () => {
    expect(sameDirectory("/home/akh/dev/app", "/home/akh/dev/application")).toBe(false);
  });

  test("normalizes a root consistently on both sides", () => {
    expect(canonicalDirectory("/")).toBe("");
    expect(sameDirectory("/", "/")).toBe(true);
    expect(sameDirectory("/", "/home")).toBe(false);
  });

  test("ignores case only on Windows", () => {
    const left = "C:\\Users\\akh\\dev\\app";
    const right = "c:\\users\\akh\\dev\\app";
    expect(sameDirectory(left, right)).toBe(process.platform === "win32");
  });
});
