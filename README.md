# llm-voice-over

Spoken turn-end notifications for [OpenCode](https://opencode.ai) and
[Claude Code](https://claude.com/claude-code).

The plugin announces only turns worth coming back for, keeps the spoken text short enough for
`pdg` to start streaming quickly, and lets the model phrase the subject instead of reading its
whole answer out loud.

```
opencode: finished work on the login redirect fix
claude: question about which database to target
claude: needs permission to run grep and python
```

## Recommended TTS: pdg

[`pdg`](https://github.com/akhenakh/pdg) is the default and the recommended engine. It is a single
static binary that runs on CPU and starts streaming audio after the first short sentence (~50–130 ms
on a desktop CPU). That is exactly what a turn-end notification needs: the user hears the point
before the rest of the sentence is synthesized.

Install it from the [pdg repository](https://github.com/akhenakh/pdg) (release archive for Linux,
macOS, and Windows, or `brew install akhenakh/tap/pdg` on macOS), then leave `command` at its
default `["pdg"]`.

Other TTS commands work too; see [Options](#options).

## How it works

1. The plugin registers an `announce` tool and tells the model when a turn qualifies and how to
   phrase it. OpenCode gets a short policy section in the system prompt of primary sessions;
   Claude Code gets the same policy as the tool's description, because Claude's built-in guard
   skips prompt sections added by mods the user installed.
2. The model calls `announce` once, as the last action of a qualifying turn, with a `kind`
   (`finished` or `question`) and a short `about` phrase.
3. The plugin validates the phrase (plain words, no paths or identifiers, short first sentence),
   composes the fixed sentence, and queues it.
4. When the turn ends normally, the queued sentence is spoken. If the turn is interrupted, fails,
   or is refused, the queue is dropped.
5. Permission prompts are spoken the moment they appear, because the turn stays suspended until
   the user answers and the model cannot announce it. A shell prompt names the programs it needs
   (`needs permission to run grep and python`), sorted and deduplicated across the pipelines and
   chains of the command; other prompts use the tool name (`needs permission to edit files`) rather
   than reading paths out loud. Calls that ask in the same burst, as parallel tool calls do, are
   collected briefly and spoken as one sentence, trimmed to the first-sentence budget: the
   sentence names the asks that fit and ends with "and more" when the rest are on screen. In
   Claude Code an ask is not a prompt by itself:
   auto mode's classifier and `dontAsk` answer it without showing a dialog, a headless run has none
   to show, and asking a question shows the question itself. A small `PermissionRequest` hook
   (`hooks/permission.sh`) records the ask with the session's mode and the tool; the mod speaks only
   when that record is one a person answers in a dialog.
   A question dialog (`AskUserQuestion`) keeps the turn open until it is answered, so it is spoken
   the same way, by the dialog's short headers (`question about DuckDB`). Unlike a permission
   prompt it is spoken in auto mode too, since the classifier never answers a question; only
   `dontAsk`, which denies it, and subagents stay quiet.
6. Child sessions (subagents) never announce: the tool is removed from their requests in OpenCode
   and refused in Claude Code, and their completions and permission prompts are ignored.

OpenCode 2 runs plugins in a background service shared by every open editor on the machine and sets
the plugin up once per open project. Each copy reads the same event stream, so the plugin speaks
only for the project that owns the session: a prompt in one tab is read out once, not once per open
tab.

The model announces when the user has a reason to come back: the task is done, a question is
answered however short, it is blocked on an answer, or a long task started earlier has finished.
It skips milestones, mid-work questions, and turns that end while a long task is still running.
Permission prompts do not wait for the model: they interrupt the turn, so the plugin speaks them
immediately.

One playback difference: OpenCode spawns a detached TTS process and kills the previous utterance
when a new one arrives, so a permission prompt never waits. A Claude Code mod has no handle on a
running child, so utterances are chained: a new announcement waits for the current one to finish.

## Install

### OpenCode

```sh
opencode plugin add git+https://github.com/akhenakh/llm-voice-over.git
```

This adds the plugin to your global OpenCode config with the default options. To set options, edit
the entry it writes, keeping the same git spec as `package` (or add the object to the `plugins`
array of a project `opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "git+https://github.com/akhenakh/llm-voice-over.git",
      "options": {
        "name": "opencode"
      }
    }
  ]
}
```

For local development, re-export the checkout from a plugin file instead. OpenCode loads
`.opencode/plugins/*` automatically (per project), and `~/.config/opencode/plugins/*` globally:

```sh
mkdir -p ~/.config/opencode/plugins
cat > ~/.config/opencode/plugins/voice-over.ts <<EOF
export { default } from "$PWD/src/index.ts"
EOF
```

A real directory with an `index.ts` works too. Re-exported plugins cannot receive
`opencode.json` options; the defaults below apply unless you change them in the source. Remove the
file, or run `opencode plugin remove git+https://github.com/akhenakh/llm-voice-over.git`, or set
`"enabled": false`, to turn announcements off.

### Claude Code

Add this repository as a marketplace, then install the plugin:

```
/plugin marketplace add akhenakh/llm-voice-over
/plugin install voice-over --marketplace akhenakh/llm-voice-over
```

To set options, run `claude plugin configure voice-over`, or edit the plugin's configuration in
`/plugin`. For local development, load the checkout directly:

```sh
claude --plugin-dir /path/to/llm-voice-over
```

Claude Code 2.1.293 or later is required (mods). Set `enabled` to false, or
`/plugin uninstall voice-over`, to turn announcements off.

## Options

| Option | Default | OpenCode | Claude Code | Description |
| --- | --- | --- | --- | --- |
| `name` | `"opencode"` / `"claude"` | array or string | string | Spoken prefix. Set to `""` to omit it. |
| `command` | `["pdg"]` / `"pdg"` | array or string | string | Command and fixed arguments. A string is split on whitespace. |
| `input` | `"arg"` | ✓ | ✓ | `"arg"` appends the sentence as the last argument; `"stdin"` pipes it. |
| `maxWords` | `20` | ✓ | ✓ | Maximum words in the whole announcement. |
| `maxFirstSentenceWords` | `9` | ✓ | ✓ | Maximum words in the first sentence. `pdg` starts streaming after it. |
| `enabled` | `true` | ✓ | ✓ | Load the plugin without announcing. |
| `debug` | `false` | — | ✓ | Write a dim transcript line for each queued, dropped, and spoken announcement. |

Other commands work too, though [`pdg`](https://github.com/akhenakh/pdg) is recommended:

```jsonc
// espeak-ng reads the sentence from argv
{ "command": ["espeak-ng", "-s", "160"] }

// piper reads it from stdin
{ "command": ["piper", "--model", "/models/voice.onnx"], "input": "stdin" }
```

`pdg` is the default because it streams from the first sentence, so audio starts while the rest is
still being synthesized. Keep the first sentence short.

## Debugging

In OpenCode, set `VOICE_OVER_DEBUG` to a file path to trace setup, tool calls, validation,
turn-end detection, and playback:

```sh
VOICE_OVER_DEBUG=/tmp/voice-over.log opencode
```

In Claude Code, set the `debug` option instead; it logs the same events with `$.ui.log`.

## Development

```sh
bun install
bun test
bun run typecheck
bun run typecheck:claude
claude plugin validate .
claude plugin test .
```

`bun test` covers the shared wording/templates and the OpenCode player, including a real `pdg`
synthesis when the binary is on `PATH`. Those tests are named `*.spec.ts` because
`claude plugin test` runs every `*.test.ts` under the repository, and the two test environments are
not interchangeable: a mod test imports `claude-code/testing`, which only resolves inside Claude
Code.

The Claude Code plugin is a mod: `.claude-plugin/` holds the plugin and marketplace manifests,
`hooks/register.ts` the module, `hooks/permission.sh` the classic hook that records real permission
dialogs, and `.claude/types/claude-code.d.ts` the vendored declarations of the mods API (written by
Claude Code 2.1.277; regenerate with `/plugin-types` on newer builds).
`src/core/` is shared by both targets, `src/index.ts` is the OpenCode plugin, and
`src/player.ts` its player.
