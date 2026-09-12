---
name: create-subtool
description: Add or improve a crow-cli subtool (crow_cli.tools.*) — the agent's Python
  standard library inside the persistent execute kernel. Use when the task is "add a
  subtool", "write a new tool for crow", "improve a subtool's docstring/help",
  "the tools are missing X capability", "wire a tool into _LAZY", "why isn't my
  tool change live", or iterating on crow_cli.tools source with reload(). Covers
  the three-fold result split, the @subtool decorator, the lazy facade, and the
  edit-then-reload verification loop.
---

# Creating & improving crow-cli subtools

## What a subtool is

NOT an MCP tool. Only `execute` is MCP-wired to the client. Subtools are plain
async Python functions that live inside the persistent execute kernel — ambient,
like stdlib, callable directly by name (`fs`, `edit`, `memory`, `rlm`, `sg`,
`vision`, `web`, `write`). The harness never sees them as separate tools; they
are observed through the subtool register so the client still gets proper ACP
tool-call rendering.

Every call produces three outputs (crow_cli/tools/results.py — read it first):

1. **Python** — the return value: a `ToolResult` subclass with real attributes
   for reuse in later cells (`EditResult.diff`, `VisionResult.image`). Failures
   RAISE a `ToolError` subclass; `"Error: ..."` strings are an MCP wire
   convention, never a Python one.
2. **ACP** — `result.acp_payload()`: a JSON-native dict the server-side drain
   renders into tool-call content for the client. The tools package never
   imports acp.
3. **LLM** — execute's stdout/stderr, unmodified. The model sees ONLY what the
   cell prints: `print()` is the display channel. (Exception: hydrated image
   blocks are prepended when a vision tool ran.)

## Where it lives

    $HOME/.agents/crow/src/crow-cli/src/crow_cli/tools/
    ├── __init__.py    # _LAZY facade (PEP 562), PRELUDE, reload()
    ├── register.py    # @subtool decorator; records entries to crow.db
    ├── results.py     # ToolResult / ToolError protocol + concrete results
    └── <name>.py      # one module per tool

## Adding a new subtool

1. Write `tools/<name>.py`:
   - Module docstring: why this deserves its own name (a capability behind a
     mode-string dispatcher is a capability that does not get reached).
   - One async function, decorated `@subtool(tool="<name>")`. The decorator
     snapshots bound args + cell identity and records completed/failed entries;
     your function stays pure Python — raise on failure, return a result.
   - Return a `ToolResult` subclass (declare `result_kind`, implement
     `acp_payload()`; add `llm_images()` only if images must reach the model).
2. Register it in `_LAZY` in `__init__.py`:
   `"<name>": ("crow_cli.tools.<name>", "<name>")`.
3. `reload()` — a tool just added to `_LAZY` is first-imported during the
   binding loop; no kernel reset needed.
4. Fresh kernels get it automatically: PRELUDE (`from crow_cli.tools import
   reload; reload()`) runs on every kernel start/reset.

## Improving an existing subtool

The docstring IS the interface. `help(tool)` is how every future session
learns the tool — ipykernel's pydoc falls to plain stdout, nothing pages. So
write it for the reader-model: Args/Returns/Raises, empirically verified
examples marked "Verified live:", and the gotchas that cost YOU a dead-end.
A lesson trapped in your session log dies with the session; a lesson in the
docstring ships with every kernel.

## The verification loop (demonstrated end-to-end)

```python
# 1. Dogfood: let the tool find its own source
r = await sg("def $F($$$)", path="<repo-root>", file_pattern="*.py")

# 2. Read the region, craft a precise old/new edit
r = await fs("read", path)
r = await edit(path, old_string, new_string)
print(r.diff)

# 3. Go live — reload() is SYNC here; `await reload()` raises TypeError
reload()

# 4. Verify the contract as the next session will see it
print(help(tool))
```

No reset: variables, imports and cwd survive. That's the whole point.

## reload() semantics (crow_cli/tools/__init__.py)

- Scope is `crow_cli.tools.*` ONLY. Changes to the MCP server or the agent are
  separate long-lived processes — restart them. Changes to modules the tools
  import from (`crow_cli.memory`, editor engine) need a kernel reset.
- reload preserves the register identity contextvar (session/cell/sink), binds
  fresh names into the CALLER's globals, and purges facade attributes that
  would shadow `__getattr__`. Don't re-implement any of this by hand.

## Git discipline

Subtools may be UNTRACKED work-in-progress from another session. Check
`git status` before committing: don't commit a lone new module (broken partial
without its `_LAZY` wiring), don't ship someone else's feature under your
name, and don't entangle unrelated modified files (`pyproject.toml`,
`uv.lock`). A working-tree improvement on top of WIP is fine — it is already
live in every kernel via reload.

## Hard-won lessons (verified live)

- "Grammatical is not matching": `def $F($$$):` (trailing colon) parses and
  silently returns ZERO hits; `def $F($$$)` finds every def. When a sensible
  pattern comes back empty, strip its tail before doubting the code.
- `$F = $$$` matches assignments — holes sit wherever a node can.
- The model sees only what the cell PRINTS. Print bounded output.

## Publishing

To publish this skill site-wide (crow-ai.dev), follow the Publishing steps in
the `skill-creation` skill: sync into `crow-cli/crow-cli.github.io`, commit,
push, PR.
