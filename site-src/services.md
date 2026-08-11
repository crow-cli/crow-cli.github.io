# Services

crow's infrastructure runs as daemons supervised by `crow-cli daemon`:

| service | what it is | health |
| --- | --- | --- |
| `crow-memory` | Rust HTTP service over LanceDB — sessions, messages, multivector ColBERT search | `/healthz` |
| `crow-mcp` | the memory tools (and more) as MCP over HTTP | tcp port |
| `ollama-mv` | multivector embedding server (the `colbert: true` model) | `/api/version` |
| `searxng` | docker container backing `web_search` | `/` |
| anything in `services:` | e.g. playwright MCP | tcp port from its mcpServers url |

Conventions: pidfile at `~/.agents/crow/run/<name>.pid`, log at
`~/.agents/crow/logs/<name>.log` (rotates 5 MB × 4).

## The commands

```bash
crow-cli daemon list          # pid / running / healthy / unmanaged for all
crow-cli daemon start all     # no-op if already running
crow-cli daemon stop crow-mcp # never kills processes we didn't start
crow-cli daemon restart all
crow-cli daemon install ollama-mv   # build what's missing, point config at
                                     # it, start, verify. Idempotent.
```

**Unmanaged is sacred.** If a service is up but we don't hold its pidfile
(you started it by hand, systemd resurrected it), `start`/`stop`/`restart`
refuse to touch it. That's deliberate — check `status` first.

## services: — run anything as a daemon

The top-level `services:` block in config.yaml declares how to run things —
typically MCP servers — as daemons. Each entry takes the daemon fields
(`command`, `args`, `env`, `health_url`, `tcp_port`, `start_timeout`,
`stop_timeout`, or the docker ones: `kind`, `container`, `compose_file`,
`compose_service`):

```yaml
mcpServers:
  playwright:
    transport: http
    url: http://localhost:2779/mcp

services:
  playwright:
    command: npx
    args: ['@playwright/mcp@v0.0.79', --port, '2779']
```

A service that shares its name with an `mcpServers:` entry and declares no
health check gets its tcp probe port from that entry's url — one source of
truth for the port. Then `crow-cli daemon start all` brings up the whole stack,
and agent sessions connect over HTTP instead of spawning stdio servers per
session.

Precedence: built-ins < `services:` < `daemons:` (per-field overrides, and
`daemons:` always wins).

## Why not systemd?

It used to be systemd user units; the supervision now lives entirely in
`crow-cli daemon` so it works identically on any machine with the repo.
If something respawns "magically" after a kill, check
`systemctl --user list-units | grep ollama` for a ghost unit from an old setup.
