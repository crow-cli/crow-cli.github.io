---
title: Crow-Bench Integration Brainstorm — MemoHarness × crow-cli × crow-ade
date: 2026-07-20
tags: [crow-bench, memoharness, architecture, brainstorm]
status: active brainstorm
---

# Crow-Bench: MemoHarness × crow-cli × crow-ade

## The Key Realization

crow-cli's `--config-file` YAML IS the harness. One file controls:

```yaml
system_prompt_path: ~/.agents/crow/prompts/notes_prompt.jinja2   # D1 Context Assembly
mcpServers: { crow-mcp, playwright-mcp, ... }             # D2 Tool Interaction
TEMPERATURE: 0.6                                           # D3 Generation
MAX_COMPACT_TOKENS: 190000                                 # D5 Memory
max_retries_per_step: 3                                    # D4 Orchestration
# D6 Output Processing → embedded in the prompt itself
```

A "harness mutation" = a different YAML + prompt file. That's it.

## Architecture

### Layer 1: The Config Surface (what gets optimized)

```
~/.crow/
  configs/
    notes_prompt.yaml          ← user's live config (NEVER mutated during tests)
    worker_prompt.yaml
    orchestrator_prompt.yaml
    bench/                     ← test harness configs (created by optimization loop)
      notes_v001.yaml
      notes_v002.yaml
      ...
  prompts/
    notes_prompt.jinja2        ← user's live prompt (NEVER mutated during tests)
    bench/                     ← test prompt variants
      notes_v001.jinja2
      notes_v002.jinja2
      ...
```

### Layer 2: The Execution Runtime (crow-cli as headless runner)

`crow-cli run` is an ACP client. It spawns an agent subprocess and drives it.
For optimization rollouts:

```bash
# Test a harness variant against a reconstructed instance
crow-cli run \
  --config-file ~/.crow/configs/bench/notes_v001.yaml \
  "You are being tested on this task: [problem_statement from instance]"
```

This is the `harbor run` equivalent. Different --config-file = different harness.
These sessions land in crow.db with their own session IDs — tagged as bench runs.

**Key insight: we do NOT need the ADE's Rust orchestration here.**

The ADE orchestration (`crow-acp/src/orchestration_state.rs`, `prompt.rs`,
`tools/orchestration.rs`) exists for **steerability**: the user can cancel,
queue prompts, see task updates in real-time, steer the agent mid-flight.
That's why it's a Rust state machine with prompt_busy serialization, queue
draining, cancel/pause, and frontend broadcast events.

Bench runs are **headless and unattended**. No steering. So we just:
- `crow-cli run --config-file bench/variant.yaml "[instance]"` with a long timeout
- Session lands in crow.db for later scoring
- Use `-s session-id` to continue a session if multi-turn is needed
- The CLI's existing nag loop (50x re-prompt on incomplete tasks) handles
  the basic "keep going until done" case
- No Rust state machine, no queue serialization, no cancel/pause, no frontend

The ADE orchestration is for humans watching. Bench runs are for machines
running unattended. Completely different problem, completely different solution.

### Layer 3: The Experience Bank (crow.db + structured extraction)

crow.db already stores everything. We add a structured layer on top:

```
~/.crow/bench/
  bank.pkl                     ← ExperienceBank (pickle, like MemoHarness)
  bank.json                    ← human-readable snapshot
  instances/                   ← reconstructed SWE-bench-like instances
    session-abc123.json
    session-def456.json
  harness/                     ← archived harness variants per iteration
    iter-01/
      notes_v001.yaml
      notes_v001.jinja2
      stats.json
    iter-02/
      ...
```

### Layer 4: The Optimization Loop (headless agent job)

Kicked off via slash command or CLI:

```
crow-cli run --config-file ~/.crow/configs/bench_optimizer.yaml \
  "Run the harness optimization loop for notes_prompt"
```

Or as a slash command in an existing session: `/harness-optimize notes`

The optimizer agent:
1. Reads crow.db → extracts instances (forensic archaeologist work)
2. Runs GEPA interrogation on each instance
3. Proposes prompt/config mutations → writes to bench/ variants
4. Tests each variant: `crow-cli run --config-file bench/notes_v00N.yaml "[instance]"`
5. Scores results (LLM-as-judge or replay comparison)
6. Keeps Pareto frontier
7. Writes winners back to live configs (with user approval? or automatic?)
8. Writes global patterns to ~/.agents/notes/ (agent reads these in future sessions!)

### Layer 5: The ADE Dashboard (crow-ade)

The ADE is NOT in the optimization loop. It's the human interface:

- **Experience Bank viewer**: panel showing per-session entries, reward trends,
  dimension failure counts. Click a session → see trajectory, diagnosis, feedback.
- **Harness editor**: the notes browser tree extended to show ~/.crow/prompts/ and
  ~/.crow/configs/ as editable files. D1-D6 mapping visible.
- **Playbook/memory editor**: global patterns written as notes, editable in the
  notes editor. The agent reads these. The human can too.
- **A/B testing UI**: add two acp.agents entries with different configs, switch
  between them, compare.
- **Approval gate**: when the optimizer proposes a winner, the ADE shows a diff
  and asks "promote this to live?" before overwriting the user's config.

## The ADE Settings as Harness Registry

```json
"acp.agents": [
  // User's live agents (untouched by optimization)
  { "name": "crow-notes",            "config": "notes_prompt.yaml" },
  { "name": "crow-cli-worker",       "config": "worker_prompt.yaml" },
  { "name": "crow-cli-orchestrator", "config": "orchestrator_prompt.yaml" },

  // Bench test agents (created by optimization loop, headless)
  { "name": "bench-notes-v001",      "config": "bench/notes_v001.yaml" },
  { "name": "bench-notes-v002",      "config": "bench/notes_v002.yaml" },

  // The optimizer itself
  { "name": "bench-optimizer",       "config": "bench_optimizer.yaml" }
]
```

## D1-D6 Mapping (concrete)

| Dim | Config field | File | What gets mutated |
|-----|-------------|------|-------------------|
| D1 | `system_prompt_path` | `*.jinja2` | Prompt text, structure, examples, instructions |
| D2 | `mcpServers` | `*.yaml` | Which MCP servers, tool descriptions |
| D3 | `TEMPERATURE`, `MAX_TOKENS` | `*.yaml` | Sampling params |
| D4 | `max_retries_per_step` | `*.yaml` | Retry logic, orchestration (mostly in prompt) |
| D5 | `MAX_COMPACT_TOKENS` | `*.yaml` | Context window management |
| D6 | (in prompt) | `*.jinja2` | Output format, validation, stopping criteria |

## Open Questions

1. **Scoring**: How do we score a bench run? Options:
   - LLM-as-judge: "given this task and this output, rate 1-5"
   - Replay comparison: run the same instance with old and new harness, compare
   - User feedback retrodicted: does the new harness avoid the corrections the user made?

2. **Instance format**: What does a reconstructed instance look like?
   ```json
   {
     "instance_id": "furry-fanatic-hyrax__msg-42",
     "session_id": "furry-fanatic-hyrax-of-enterprise",
     "problem_statement": "user asked to write VISION.md for bio-studies",
     "config_snapshot": { "prompt": "notes_prompt.jinja2@abc123", "yaml": "notes_prompt.yaml" },
     "trajectory": { "tool_calls": [...], "tokens": 45000, "turns": 23 },
     "user_feedback": { "corrections": 3, "profanity": true, "accepted": true },
     "gold_patch": "the final VISION.md content",
     "hints_text": ["no wait, do it in chunks", "that's not the point moron"],
     "diagnosis": { "primary_dim": "D6", "analysis": "write tool failed on large content" }
   }
   ```

3. **Orchestration**: RESOLVED. Bench runs don't need the ADE's Rust orchestration.
   `crow-cli run --config-file bench/variant.yaml "[instance]"` with a long timeout
   is sufficient. Use `-s session-id` for multi-turn. The CLI's nag loop handles
   "keep going until done." No steering needed for headless runs.

4. **Parallelism**: MemoHarness runs N concurrent harbor jobs. We can spawn N
   concurrent `crow-cli run` subprocesses. crow-cli is 6500 LOC — adding a
   parallel runner is tractable.

5. **When does the user approve?** Options:
   - Fully automatic: optimizer writes winners to live config
   - Approval gate: optimizer proposes, ADE shows diff, user clicks "promote"
   - Hybrid: automatic for small changes (temperature, retries), approval for prompt rewrites
