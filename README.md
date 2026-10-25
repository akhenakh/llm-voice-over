# opencode-voice-over

Spoken turn-end notifications for [OpenCode](https://opencode.ai) 2.

The plugin announces only turns worth coming back for, keeps the spoken text short enough for
`pdg` to start streaming quickly, and lets the model phrase the subject instead of reading its
whole answer out loud.

```
opencode: finished work on the login redirect fix
opencode: question about which database to target
opencode: needs permission to run a command
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

1. The plugin registers an `announce` tool and injects a short policy into the system prompt of
   primary sessions. The policy says when a turn qualifies and how to phrase it.
2. The model calls `announce` once, as the last action of a qualifying turn, with a `kind`
   (`finished` or `question`) and a short `about` phrase.
3. The plugin validates the phrase (plain words, no paths or identifiers, short first sentence),
   composes the fixed sentence, and queues it.
4. When the turn ends (`session.execution.succeeded`), the queued sentence is spoken. If the turn
   fails or is interrupted, the queue is dropped.
5. Permission prompts (`permission.asked`) are spoken the moment they appear, because the turn stays
   suspended until the user answers and the model cannot announce it. The plugin phrases the request
   from the permission action (`needs permission to run a command`, `needs permission to edit files`)
   instead of reading paths or commands out loud.
6. Child sessions (subagents) never announce: the tool is removed from their requests and their
   completions and permission prompts are ignored.

The model announces only when the user has a reason to come back: the task is done, it is blocked
on an answer, or a long task started earlier has finished. It skips ordinary chat turns,
milestones, mid-work questions, and turns that end while a long task is still running. Permission
prompts do not wait for the model: they interrupt the turn, so the plugin speaks them immediately.

## Install

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

## Options

| Option | Default | Description |
| --- | --- | --- |
| `name` | `"opencode"` | Spoken prefix. Set to `""` to omit it. |
| `command` | `["pdg"]` | Command and fixed arguments. A string is split on whitespace. |
| `input` | `"arg"` | `"arg"` appends the sentence as the last argument; `"stdin"` pipes it. |
| `maxWords` | `20` | Maximum words in the whole announcement. |
| `maxFirstSentenceWords` | `9` | Maximum words in the first sentence. `pdg` starts streaming after it. |
| `enabled` | `true` | Load the plugin without announcing. |

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

Set `VOICE_OVER_DEBUG` to a file path to trace setup, tool calls, validation, turn-end detection,
and playback:

```sh
VOICE_OVER_DEBUG=/tmp/voice-over.log opencode
```

## Development

```sh
bun install
bun test
bun run typecheck
```

The tests cover the wording/templates and the player, including a real `pdg` synthesis when the
binary is on `PATH`.
