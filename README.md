# opencode-voice-over

Spoken turn-end notifications for [OpenCode](https://opencode.ai) 2, synthesized with
[`pdg`](https://github.com/akhenakh/pdg) by default.

The plugin announces only turns worth coming back for, keeps the spoken text short enough for
`pdg` to start streaming quickly, and lets the model phrase the subject instead of reading its
whole answer out loud.

```
opencode: finished work on the login redirect fix
opencode: question about which database to target
```

## How it works

1. The plugin registers an `announce` tool and injects a short policy into the system prompt of
   primary sessions. The policy says when a turn qualifies and how to phrase it.
2. The model calls `announce` once, as the last action of a qualifying turn, with a `kind`
   (`finished` or `question`) and a short `about` phrase.
3. The plugin validates the phrase (plain words, no paths or identifiers, short first sentence),
   composes the fixed sentence, and queues it.
4. When the turn ends (`session.execution.succeeded`), the queued sentence is spoken. If the turn
   fails or is interrupted, the queue is dropped.
5. Child sessions (subagents) never announce: the tool is removed from their requests and their
   completions are ignored.

The model is told not to announce interrupting questions asked mid-work, phase milestones, or a
turn that ends while a long task it started is still running.

## Install

As a package, once published:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-voice-over",
      "options": {
        "name": "opencode"
      }
    }
  ]
}
```

For local development, point a plugin directory at this checkout. OpenCode loads
`.opencode/plugins/*/index.ts` automatically:

```sh
mkdir -p .opencode/plugins/voice-over
cat > .opencode/plugins/voice-over/index.ts <<EOF
export { default } from "$PWD/src/index.ts"
EOF
```

Using a directory means options cannot be passed through `opencode.json`; the defaults below apply
unless you change them in the source.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `name` | `"opencode"` | Spoken prefix. Set to `""` to omit it. |
| `command` | `["pdg"]` | Command and fixed arguments. A string is split on whitespace. |
| `input` | `"arg"` | `"arg"` appends the sentence as the last argument; `"stdin"` pipes it. |
| `maxWords` | `20` | Maximum words in the whole announcement. |
| `maxFirstSentenceWords` | `9` | Maximum words in the first sentence. `pdg` starts streaming after it. |
| `enabled` | `true` | Load the plugin without announcing. |

Any TTS command works, not only `pdg`:

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
