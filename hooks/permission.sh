#!/bin/sh
# Records that Claude Code is really showing a permission dialog for this
# session. `tool.check` sees an `ask` even when auto mode or `dontAsk` answers
# it without a dialog, so the mod speaks only after this record appears.
#
# The record is `<tmpdir>/voice-over-permission-<session id>`, the path the mod
# clears before an ask and reads back a moment later. The content is not used.

payload=$(cat)
session=$(printf '%s' "$payload" |
  sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -n 1)

[ -n "$session" ] || exit 0
printf 'prompt' >"${TMPDIR:-/tmp}/voice-over-permission-$session"
exit 0
