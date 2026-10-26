/**
 * OpenCode hosts every open project in one server and sets a plugin up once per
 * location, so each instance reads the same event stream. A session belongs to
 * exactly one location, and the events that report it carry that location, so
 * comparing directories keeps one project from speaking for another.
 */

const TRAILING_SEPARATORS = /[\\/]+$/;
const WINDOWS = process.platform === "win32";

/**
 * The same directory can be spelled with a trailing separator, or with either
 * separator and any case on Windows. Dropping the trailing separator also drops
 * the one of a root (`/`), consistently on both sides.
 */
export function canonicalDirectory(directory: string): string {
  const trimmed = directory.replace(TRAILING_SEPARATORS, "");
  return WINDOWS ? trimmed.toLowerCase() : trimmed;
}

export function sameDirectory(left: string, right: string): boolean {
  return canonicalDirectory(left) === canonicalDirectory(right);
}
