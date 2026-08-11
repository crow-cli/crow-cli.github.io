# crow-cli

A stateful, ACP-native coding agent. No framework — OpenAI SDK, FastMCP, and a
shared LanceDB memory store every agent can query.

## What we didn't build

|  |  |
| --- | --- |
| Permissions | The agent has the same access you do. You trust it or you don't run it. |
| New protocol | We use ACP. No new data model for agent-client interaction. |
| Offline agent | Every agent has `web_search` and `web_fetch` and is prompted to use them liberally. |
| Static skill packages | Skills are markdown the agent loads at runtime — and [this site publishes ours](skills/index.md). |

## Start here

- [Installation](installation.md) — clone and build from source, like zed
- [Configuration](configuration.md) — everything in `config.yaml`
- [Zed](zed.md) — running crow from our zed fork (recommended client)
- [Services](services.md) — the daemon layer: memory, MCP, embeddings, searxng
- [CLI walkthrough](cli.md) — every part of the `crow-cli` helper
- [Skills](skills/index.md) — the workflows our agents load at runtime

## The shape of it

- **`crow-cli acp`** is the agent. Editors (zed, Crow ADE) speak ACP to it over stdio.
- **`crow-cli run`** is the client — one-shot prompts, a REPL, and the delegation
  mechanism between agents.
- **crow-memory** is a Rust HTTP service over LanceDB. Sessions, messages, and
  multivector ColBERT embeddings; agents mine each other's history with
  `query_memory` / `query_session`.
- **Skills** are directories in `~/.agents/skills` with a `SKILL.md`. The system
  prompt catalogues them; the agent reads one when a task matches.
