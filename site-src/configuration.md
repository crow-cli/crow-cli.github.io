# Configuration

Everything lives in `~/.agents/crow/config.yaml` (override the directory with
`--config-dir/-d` on any command). Secrets go in `~/.agents/crow/.env`; any
`${VAR}` in the yaml is expanded from the environment at load time.

A complete annotated example:

```yaml
# ---------------------------------------------------------------- LLMs --
# providers: OpenAI-compatible base URLs + keys. ${VAR} reads from .env/shell.
providers:
  alibaba:
    base_url: https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
    api_key: ${ALIBABA_API_KEY}
  llamacpp:
    base_url: http://lan-host:1234/v1
    api_key: ${LLAMACPP_API_KEY}

# models: names YOU pick, mapped to a provider's model id. The FIRST model
# is the default. capabilities restricts modality handling (omit = assume the
# model can do everything); fallbacks is the ordered chain used when a model
# can't handle the modalities present in the conversation.
models:
  glm-5.2:
    provider: alibaba
    model: glm-5.2
  qwen3.7-plus:
    provider: alibaba
    model: qwen3.7-plus
    capabilities: [vision]        # text+vision; omit the key for "assume all"
    fallbacks: [glm-5.2]          # if this model can't take the attachment

# ---------------------------------------------------------------- MCP --
# mcpServers: tools the agent gets at session creation. stdio servers are
# spawned per session; http servers are connected to (run them as services).
mcpServers:
  crow-mcp-dev:
    transport: http
    url: http://127.0.0.1:2770/mcp
  playwright:
    # playwright-mcp enforces a Host allowlist: localhost, not 127.0.0.1
    transport: http
    url: http://localhost:2779/mcp

# ------------------------------------------------------------- services --
# services: how to run things (typically MCP servers) as daemons. Each entry
# takes daemon fields; a service named like an mcpServers entry with no health
# check gets its tcp probe port from that entry's url. `crow daemon start all`
# brings the whole stack up. See services.md.
services:
  playwright:
    command: npx
    args: ['@playwright/mcp@v0.0.79', --port, '2779']

# ------------------------------------------------------------- memory --
memory_path: ~/.agents/crow/memory.lance   # the LanceDB store
memory_port: 27697                         # where crow-memory listens

embedding:
  base_url: http://127.0.0.1:11392         # ollama-mv multivector server

# ------------------------------------------------------ agent behavior --
skills_dir: ~/.agents/skills               # scanned at session creation
system_prompt_path: ~/.agents/crow/prompts/system_prompt.jinja2

MAX_COMPACT_TOKENS: 190000   # compaction threshold
MAX_TOKENS: 38192            # completion cap
TEMPERATURE: 0.6
max_retries_per_step: 3      # react-loop retries per step

# crow-memory client retry budget: total attempts (0 = forever), first
# backoff seconds, per-step cap. Defaults ≈ 3.5 min of backoff so the agent
# waits out crow-memory restarts instead of dying.
memory_max_retries: 12
memory_retry_base_delay: 0.5
memory_retry_max_delay: 30.0

chunk_log: false             # write every raw chunk to JSONL (debugging)

# ------------------------------------------------------------- daemons --
# daemons: per-service overrides of ANY spec (built-in, services:, or these).
# Keys: command, args, env, health_url, tcp_port, container, compose_file,
# compose_service, start_timeout, stop_timeout.
daemons:
  ollama-mv:
    start_timeout: 90
```

## Precedence and gotchas

- **First model is the default.** `crow-cli models` lists them; `run -m` /
  `acp -m` overrides per invocation.
- **`${VAR}` expansion** applies to the whole file; unset variables expand to
  empty and produce a startup warning.
- **`system_prompt_path`** is written by `crow init`. Delete the key to fall
  back to the built-in prompt; `-p/--system-prompt-path` on `acp` wins over both.
- **`daemons:` always wins** — built-ins < `services:` < `daemons:`.
