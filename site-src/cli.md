# The CLI

`crow-cli` is the helper around the agent. The shape of it:

```
crow-cli
├── acp       the agent itself (editors speak ACP to this over stdio)
├── run       the client — one-shot prompts, REPL, delegation
├── init      interactive config scaffolding
├── models    list configured models
├── daemon    the infrastructure layer (see services.md)
├── install   Crow Desktop IDE
└── auth      ACP Registry compliance stub
```

Every command takes `--config-dir/-d` (default `~/.agents/crow`).

## `acp` — the agent

The main entry point. An ACP client (zed, Crow ADE) spawns this over stdio;
it serves sessions, tools, and streaming updates.

```
--config-dir -d <path>    configuration directory
--debug                   chunk-level JSONL logging
--system-prompt-path -p   override the jinja2 template
--config-file -o <yaml>   overlay config values
--model -m <name>         model from config.yaml's models:
```

You rarely run this by hand — your editor does.

## `run` — the client

One prompt in, response out. Or a REPL with `-i`.

```
--prompt-file -f <path>   read the prompt from a file
--interactive -i          REPL loop
--session -s <id>         continue an existing session
--cwd -c <dir>            working directory
--model -m <name>         override the (session's) model
--json -j                 JSONL events to stdout, no rich rendering
--verbose -v
```

### Delegation

`run` is also how agents launch subagents. Every session persists in the
shared LanceDB store, so any agent can read any other's thoughts:

```bash
# 1. launch a worker (gets a coolname session id)
crow-cli run "refactor the parser into its own module"

# 2. continue it
crow-cli run -s <session-id> "now add tests"

# 3. long pre-written prompts from file or stdin
crow-cli run -f delegation.md -s <session-id>
cat delegation.md | crow-cli run -

# 4. from another agent: query_session(session_id="<session-id>")
```

No bespoke agent-to-agent protocol — a shared database and a read query.

## `init`

Interactive scaffolding: writes `config.yaml`, `.env`, and the system prompt
template into the config dir. `--yes/-y` skips confirmations. Idempotent —
existing files are read and offered as defaults.

## `models`

Lists the models from config.yaml (first one is the default). `--json` for
machine-readable output.

## `daemon`

The infrastructure layer — `start|stop|restart|status|list|install`. See
[Services](services.md).

## `install`

`crow-cli install desktop` — the Crow Desktop IDE (a VS Code fork with the ACP
client built in). `crow-cli install check` for available releases.

## `auth`

Declares authentication support for ACP Registry compliance. No actual
authentication is required for FOSS deployments.
