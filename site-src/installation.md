# Installation

crow-cli runs best as source, through uv. If you've built zed from source, you
know this dance.

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Python 3.11+
- Rust (for crow-memory, the Rust memory service)
- Node (some MCP servers, e.g. playwright)

## Clone and build

Clone the monorepo into `~/.agents/crow/src/crow-cli` — that path is the
convention everything else on this site assumes:

```bash
git clone https://github.com/crow-cli/crow-cli ~/.agents/crow/src/crow-cli
```

Run the CLI straight from the source tree:

```bash
uv --project ~/.agents/crow/src/crow-cli/crow-cli run crow-cli --help
```

Most people wrap that. For example, in your shell rc:

```bash
alias crow="uv --project ~/.agents/crow/src/crow-cli/crow-cli run crow-cli"
```

## Initialize config

```bash
crow init          # interactive: writes ~/.agents/crow/config.yaml, .env, prompts/
crow init --yes    # skip confirmations
```

`init` writes a `config.yaml` skeleton, a `.env` for secrets, and the jinja2
system prompt template to `~/.agents/crow/prompts/`. Then fill in at least one
provider and model — see [Configuration](configuration.md).

## Provision the infrastructure

The agent wants its daemon layer up (memory, MCP, embeddings, search):

```bash
crow daemon install ollama-mv   # builds the multivector embedding server, starts it
crow daemon start all           # crow-memory, crow-mcp, ollama-mv, searxng, services:
```

See [Services](services.md) for what each one is.

## Point an editor at it

The recommended client is our [zed fork](zed.md). Any ACP client works; the
agent server entry is just:

```jsonc
"agent_servers": {
  "crow-cli": {
    "type": "custom",
    "command": "uv",
    "args": ["--project", "~/.agents/crow/src/crow-cli/crow-cli", "run", "crow-cli", "acp"]
  }
}
```

## The install script

`curl -fsSL crow-ai.dev/install.sh | bash` exists and installs a packaged
`crow-cli` plus the Crow desktop IDE. It works; we still recommend source —
you'll want the monorepo around anyway (it's the docs, the skills, and the
memory tooling).
