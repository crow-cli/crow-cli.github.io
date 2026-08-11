---
name: use-uv
description: >-
  A ready-to-run Python sandbox that lives inside this skill. Use it whenever
  you need to EXECUTE Python — the terminal harness REJECTS raw python3/python
  ("Use 'uv' instead of python"), but `uv --project ~/.agents/skills/use-uv run
  python ...` is always allowed. Comes with pyyaml, httpx, and rich
  pre-installed; add more with `uv --project ~/.agents/skills/use-uv add <pkg>`.
  Reach for this to parse YAML/JSON, hit an HTTP API, pretty-print with rich, or
  run any throwaway script without setting up a venv. Trigger keywords — run
  python, execute script, uv, virtual environment, venv, pyyaml, httpx, parse
  yaml, harness rejected python.
---

# use-uv — the always-available Python sandbox

This skill directory **is a uv project**. It ships a virtual environment with a
small toolbox of dependencies, so you can run Python anywhere, anytime, without
provisioning anything.

## Why this exists

The terminal harness **refuses raw Python**:

    $ python3 -c 'print(1)'
    REJECTED: Use 'uv' instead of python.

`uv --project <path> run` is the sanctioned path. This skill is a pre-built
project you can always point at, so you never have to scaffold a venv just to
run a snippet.

## The incantation

```bash
# run an inline snippet
uv --project ~/.agents/skills/use-uv run python -c 'import yaml; print("ok")'

# run a script file
uv --project ~/.agents/skills/use-uv run /tmp/myscript.py

# pipe a heredoc straight into the interpreter
uv --project ~/.agents/skills/use-uv run python - <<'PY'
import httpx
print(httpx.get("https://httpbin.org/get").status_code)
PY
```

The first run syncs the venv (a few seconds); after that it is instant. The
`.venv` lives in this directory but is hidden from the agent directory tree.

## Pre-installed toolbox

| package | good for |
|---|---|
| `pyyaml` | parse/emit YAML — SKILL.md frontmatter, configs, k8s, etc. |
| `httpx` | HTTP client (sync + async) — hit APIs, download, test endpoints |
| `rich` | pretty terminal tables / syntax highlighting / progress |

## Adding more dependencies

```bash
# persist into this project (updates pyproject.toml + uv.lock)
uv --project ~/.agents/skills/use-uv add pandas

# one-off, WITHOUT persisting (extra dep just for this run)
uv --project ~/.agents/skills/use-uv run --with numpy python -c 'import numpy; print(numpy.__version__)'
```

Prefer `--with` for a throwaway dep; use `add` when future runs will need it.
Keep the persisted set lean — this is a shared sandbox, not a kitchen sink.

## Recipes

```bash
# parse a SKILL.md / markdown frontmatter block
uv --project ~/.agents/skills/use-uv run python - <<'PY'
import yaml
t = open("/home/thomas/.agents/skills/sg/SKILL.md").read()
meta = yaml.safe_load(t[3:t.index("---", 3)])
print(meta["name"], len(meta["description"]))
PY

# quick GET and show status + length
uv --project ~/.agents/skills/use-uv run python -c 'import httpx; r=httpx.get("https://astgrep.com"); print(r.status_code, len(r.text))'

# pretty-print a dict as a rich table
uv --project ~/.agents/skills/use-uv run python -c 'from rich import print; print({"ok": True, "n": 42})'
```

## Notes

- `requires-python = ">=3.11"`; uv picks a suitable interpreter automatically.
- `pyproject.toml` sets `[tool.uv] package = false` — this is a deps-only
  environment, not an installable package, so `uv sync` just installs the deps.
- If the venv ever gets wedged: `rm -rf ~/.agents/skills/use-uv/.venv && uv
  --project ~/.agents/skills/use-uv sync`.
