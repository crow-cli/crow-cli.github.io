# Zed

The recommended client is our fork of zed — it's where the crow rebrand and
the agent-registry entry for `crow-cli` live. Dev branch: `acp-v2`.

## Clone and build

Same as building zed upstream: clone, bootstrap, run.

```bash
git clone -b acp-v2 https://github.com/odellus/zed ~/.agents/crow/src/zed
cd ~/.agents/crow/src/zed
script/bootstrap
cargo run
```

You know the zed build drill (Rust toolchain, platform deps — the upstream
docs cover them). Keeping the checkout under `~/.agents/crow/src/` keeps all
of crow's source in one tree.

## Point it at crow-cli

In zed settings (`zed: open settings`), under `agent_servers`:

```jsonc
"agent_servers": {
  // the fork ships a registry entry for crow-cli
  "crow-cli": { "type": "registry" },

  // ...or pin it to your source checkout explicitly:
  "crow-cli-src": {
    "type": "custom",
    "command": "uv",
    "args": [
      "--project", "/home/you/.agents/crow/src/crow-cli/crow-cli",
      "run", "crow-cli", "acp"
    ]
  }
}
```

The custom entry is also exactly what you'd use with **vanilla upstream zed**
— ACP is the contract, the fork is not required. Pick the server in the agent
panel and go.

## Keeping current with upstream

The fork tracks `zed-industries/zed` and merges upstream regularly (that's
what the `upstream-merge` skill does). If you run your own checkout, add the
upstream remote and rebase `acp-v2` on it now and then.
