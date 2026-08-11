---
name: learn
description: Optimize agent harness configs via bench testing. Use when the user
  asks to "improve the prompt", "run a bench", "optimize the harness", "A/B test
  configs", or "learn from failures." Builds test instances from crow.db, runs
  variants, judges outputs, and hill-climbs toward better configs.
---

# Learn: Harness Optimization Pipeline

## Overview

This skill implements an evolutionary optimization loop for crow-cli agent
configs, grounded in two research lines:

- **MemoHarness** (arXiv:2607.14159) — decomposes the agent harness into six
  optimizable dimensions (D1-D6) and learns from execution experience.
- **GEPA** (arXiv:2507.19457, ICLR 2026 Oral) — reflective prompt evolution
  that beats RL by 6-20% with 35x fewer rollouts, using natural language
  reflection on execution traces instead of scalar rewards.

The core loop: build dataset → run bench → reflect on traces → mutate → select
Pareto frontier → merge → repeat.

**The agent IS the optimizer.** We do NOT wrap crow-cli in DSPy adapters.
DSPy assumes a closed typed circuit with enumerable inputs — a coding agent
is open-loop partial observation over a filesystem. SWE-bench-style tasks
don't map to `Example(question=..., answer=...)`. Instead, the optimization
loop is itself a crow-cli session that reads traces, reflects in natural
language, proposes config mutations, spawns parallel bench runs, and selects
winners. See `references/gepa-research.md` for the full architectural argument.

## Quick Start

```bash
# 1. Build test instances from recent sessions
python ~/.agents/skills/learn/scripts/build_dataset.py --last 20

# 2. Run baseline
python ~/.agents/skills/learn/scripts/run_bench.py \
  --config ~/.agents/skills/learn/assets/bench/configs/baseline.yaml \
  --instances ~/.agents/skills/learn/assets/bench/instances/

# 3. Judge results
python ~/.agents/skills/learn/scripts/judge.py \
  --results ~/.agents/skills/learn/assets/bench/results/

# 4. Propose mutation (manual or via optimize.py)
python ~/.agents/skills/learn/scripts/optimize.py --iterations 3
```

## The Six Dimensions (D1-D6)

When mutating configs, target one dimension at a time:

| Dim | Name | What to mutate |
|-----|------|---------------|
| D1 | Context Assembly | system_prompt_path, what goes in the prompt |
| D2 | Tool Interaction | mcpServers list, tool descriptions |
| D3 | Generation Control | temperature, max_tokens, model choice |
| D4 | Orchestration | max_retries, nag loop, task decomposition |
| D5 | Memory Management | compaction settings, context window |
| D6 | Output Processing | output format instructions, validation |

## Workflow

### Step 1: Identify failure mode

Read recent sessions from crow.db. Look for:
- User corrections ("no, I meant...", "that's wrong")
- Abandoned sessions (user stopped responding)
- Repeated tool errors
- Agent going in circles

### Step 2: Classify the failure

Which dimension failed?
- D1: Agent didn't have the right context
- D2: Agent used wrong tools or missed available tools
- D3: Agent hallucinated or was too verbose/terse
- D4: Agent didn't break down the task properly
- D5: Agent lost context mid-conversation
- D6: Agent's output format was wrong

### Step 3: Build a test instance

Create a directory in `assets/bench/instances/`:
```
instances/NNN-short-description/
├── problem.md        # The user's original request
├── context.json      # Relevant conversation history
├── expected.md       # What a correct agent would do
└── score_rubric.md   # How to judge success (0-5 scale)
```

### Step 4: Run A/B test

```bash
crow-cli run --config-file baseline.yaml -s bench-baseline-NNN "$(cat problem.md)"
crow-cli run --config-file variant.yaml  -s bench-variant-NNN  "$(cat problem.md)"
```

### Step 5: Judge and decide

Score both outputs against the rubric. If variant wins, promote it.
If tie or loss, discard and try a different mutation.

## Config YAML Format

The config YAML IS the harness. One file controls all six dimensions:

```yaml
# baseline.yaml
model: anthropic/claude-sonnet-4-20250514
temperature: 0.7
system_prompt_path: ~/.agents/crow/prompts/system_prompt.jinja2
mcpServers:
  crow-mcp:
    command: uv
    args: [--project, /home/thomas/src/crow-team/crow-mcp, run, crow_mcp.py]
  crow-task-mcp:
    command: uv
    args: [--project, /home/thomas/src/crow-team/crow-task-mcp, run, crow_task_mcp.py]
```

## Rules

- Never mutate the user's live config. Always work on copies.
- One dimension per mutation. Isolate variables.
- Max 5 iterations per optimization run.
- Always show the user the diff before promoting a variant.
- Exclude model-failure sessions (e.g., tool bugs) from training data.

## GEPA Principles (baked in)

These come from the GEPA paper and apply to every optimization run:

1. **Reflect, don't just score.** When a bench run fails, interrogate the
   trace. "The agent called `read` 4 times before the user corrected it to
   use `edit`" is worth more than `score=0.2`. User corrections ARE the
   feedback signal (see `references/feedback-ground-truth.md`).

2. **Pareto frontier, not greedy best.** Keep the non-dominated set across
   all instances. A config that excels at code editing but struggles with
   note-taking stays on the frontier. Don't collapse to one winner.

3. **Merge complementary winners.** If variant A fixed D1 failures and
   variant B fixed D4 failures, combine them. Don't just pick one.

4. **Reflection minibatches.** Reflect on 3-5 failures together, not one
   at a time. Patterns emerge from batches that single traces hide.

5. **Sample efficiency.** Each failed session is worth more when you
   interrogate it than when you just score it. GEPA gets 35x more from
   each rollout than RL. Our traces have user corrections, tool errors,
   and multi-turn context — exploit all of it.

6. **No DSPy adapters.** The optimization loop is a crow-cli session.
   Reflection is an agent call. Pareto selection is an agent reading a
   score table. Merge is an agent reading two diffs. No typed circuits,
   no `ProposalFn`, no `ScoreWithFeedback`. See `references/gepa-research.md`.

## References

- `references/gepa-research.md` — GEPA paper, DSPy fit analysis, why we don't use adapters
- `references/memoharness-analysis.md` — D1-D6 framework from the paper
- `references/feedback-ground-truth.md` — User feedback as reward signal
- `references/instance-schema.md` — Test instance format spec
- `references/integration-brainstorm.md` — Architecture: MemoHarness × crow-cli × crow-ade
