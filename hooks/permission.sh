#!/bin/sh
# Records the permission request Claude Code is building for this session, at
# `<tmpdir>/voice-over-permission-<session id>`.
#
# The classic hook runs whether or not a dialog follows: auto mode's classifier,
# `dontAsk`, a headless run and the question dialog each answer an ask without
# drawing a permission prompt. The record carries what the mod needs to tell
# those apart — the mode, the tool, and whether a subagent asked, three
# tab-separated fields — and the mod decides whether to speak (`promptShows`).
#
# The record is cleared by the mod before each ask; its content is read back a
# moment later.

payload=$(cat)

# The payload is one line of JSON, so a greedy match reaches the field.
field() {
  printf '%s' "$payload" |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" |
    head -n 1
}

session=$(field session_id)
[ -n "$session" ] || exit 0

printf '%s\t%s\t%s\n' "$(field permission_mode)" "$(field tool_name)" "$(field agent_id)" \
  >"${TMPDIR:-/tmp}/voice-over-permission-$session"
exit 0
