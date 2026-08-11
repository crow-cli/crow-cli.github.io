---
title: MemoHarness Analysis — What It Does and How It Maps to Crow
date: 2026-07-20
tags: [memoharness, gepa, crow-bench, agent-optimization, research]
source: ~/src/crow-team/MemoHarness (arXiv 2607.14159)
---

# MemoHarness: Agent Harnesses That Learn from Experience

## What It Is

MemoHarness optimizes the **agent harness** (the control layer around the model) rather than the model weights. A "harness" = how context is built, which tools are exposed, decoding config, multi-step orchestration, memory persistence, and output validation.

Most agent systems ship one fixed global harness. MemoHarness **learns from execution experience** and then **specializes the harness per case** at evaluation time — no test-time labels, feedback, or extra search rounds.

## Core Architecture

### Six-Dimensional Harness Space (D1–D6)

| Dim | Name | What it controls |
|-----|------|-----------------|
| D1 | Context Assembly | System prompt, few-shot examples, instruction framing, compression |
| D2 | Tool Interaction | Shell strategy, tool protocol (native vs bash_tags), retrieval, top-k |
| D3 | Generation Control | Temperature, max_tokens, top_p, candidate_count |
| D4 | Orchestration | Workflow topology (single_call → plan/execute/refine), stop rules, retries |
| D5 | Memory Management | Cross-call state: sliding_window, summary_buffer, importance_based |
| D6 | Output Processing | Postprocess, validation, fallback behavior |

### Two-Phase Design

**Phase A — Training-time search:**
1. Run benchmark cases (terminal-bench on Harbor/Daytona sandboxes)
2. Parse results → build `PerCaseEntry` records (config, trajectory, reward, diagnosis)
3. Store in **Experience Bank** `B_t = (E_t, G_t)`
   - `E_t` = per-case execution entries
   - `G_t` = distilled global patterns (cross-case failure patterns)
4. **Distillation triggers**: (a) any case hits N consecutive failures, OR (b) every M new entries
5. **LLM Distiller** reads failure histories → generates actionable `GlobalPattern` entries
6. **Controller** (LLM or Codex CLI) reads bank summary → rewrites the harness
7. Repeat for K iterations

**Phase B — Test-time case adaptation:**
1. For each unlabeled test case, retrieve similar cases from the frozen bank
2. Adapt the global harness config to the specific case
3. Execute with the case-specific harness

### Experience Bank Details

- **Per-case entries**: case_id, iteration, features (domain, complexity, ambiguity), config snapshot, delta from prev config, trajectory (tokens, latency, tools), reward, diagnosis (success, analysis, primary failure dimension)
- **Case stats**: consecutive failures, reward trend (improving/stable/degrading), per-dimension failure counts
- **Global patterns**: description, evidence (case_ids), effect, primary_dim
- **Retrieval**: feature-filtered, progressively relaxed (strict → domain-only), semantic similarity via embeddings, cluster-based sampling
- **Persistence**: pickle (runtime) + JSON (inspection)

### Controller (Codex Bundle Mode)

The controller is itself an agent (Codex CLI) that directly edits the harness bundle:
- `AGENTS.override.md` — primary task-scaffolding and execution rules
- `.memoharness/playbook.md` — stable repo-level heuristics
- `.memoharness/memory.md` — rolling distilled memory
- `policy.json` — structured D1-D6 summary + runtime hints

Each iteration: controller reads bank summary + failure excerpts + change-outcome signals → rewrites bundle files in place → validates → archives.

### Selection

- **Correctness-first**: optimize task reward; token cost only as tiebreaker
- **Best harness modes**: mean_reward, perfect_success_count
- Archives every iteration's harness; restores the best at the end

---

## Mapping to Crow

| MemoHarness | Crow Equivalent |
|---|---|
| Benchmark cases (terminal-bench) | Real user sessions from crow.db |
| Verifier reward (pass/fail) | User feedback (corrections, acceptance, profanity = ground truth) |
| HarnessConfig D1–D6 | crow-cli system prompt, tool descriptions, MCP server configs, `~/.crow/configs/*.yaml`, `~/.crow/prompts/*.jinja2` |
| Experience Bank | Dataset extracted from crow.db traces + git history |
| LLM Distiller | GEPA-style reflective interrogation ("you did X, Y happened — what would you do differently?") |
| Controller rewriting harness | Agent optimizing crow-cli's own prompts/configs |
| Training loop (Harbor subprocess) | Slash command kicking off multi-hour delegated agent job |
| Per-case entry | SWE-bench-like instance (repo, base_commit, gold patch, problem_statement, hints_text) |
| Harbor/Daytona sandbox | crow-cli itself (the agent IS the subject) |
| `AGENTS.override.md` + playbook + memory | crow's system prompt + config YAML + Jinja2 prompt templates |

### Key Differences

1. **Data source**: MemoHarness has clean benchmark tasks; we reconstruct instances from messy real traces (the "forensic archaeologist" problem — matching timestamps to git commits, figuring out which repo a session was in, handling deleted/rebased repos)
2. **Reward signal**: MemoHarness has binary verifier; we have noisy human feedback (but richer — corrections, mid-session pivots, emotional valence)
3. **Execution environment**: MemoHarness uses Harbor/Daytona; we use crow-cli eating its own tail
4. **Interrogation**: MemoHarness distills patterns heuristically or via LLM; we do GEPA-style reflective interrogation — replay trajectory, ask the model *why* it made each decision knowing the outcome

### What We Should Steal

1. **D1–D6 decomposition** — structure what we're optimizing into separable dimensions instead of one opaque prompt blob
2. **Dual-layer experience bank** (per-case entries + global patterns) — exactly what we need for the dataset
3. **Progressive relaxation retrieval** — strict feature match → domain-only fallback
4. **Distillation triggers** — consecutive failures OR every-N entries, not just end-of-epoch
5. **Codex bundle structure** — AGENTS.override.md / playbook.md / memory.md / policy.json maps cleanly to crow's config/prompt system
6. **Correctness-first selection** with cost as tiebreaker
7. **Test-time case adaptation** — specialize the harness per case at eval time
8. **Change-outcome signals** — track what config delta was applied and what reward resulted (the `delta_from_prev` field)
9. **Archiving every iteration** — so you can restore the best harness at the end

### What We'd Do Differently

1. **Instance reconstruction** is the hard part (not in MemoHarness at all) — matching crow.db traces to git history, reconstructing base_commit / gold patch / test criteria from real user sessions
2. **GEPA interrogation** replaces their LLM Distiller — denser signal, more interactive, counterfactual reasoning
3. **The agent is both subject and optimizer** — crow optimizing crow, not a separate benchmark harness
4. **Slash command UX** — `/crow-bench extract` or similar, delegating to an agent with canned prompts + config files
5. **No sandbox needed** — we're optimizing prompts/configs, not executing code in containers

---

## Architecture Sketch (Crow-Bench)

```
/crow-bench extract
    │
    ├─ Agent reads crow.db traces
    ├─ Agent reads git logs on filesystem
    ├─ Reconstructs SWE-bench-like instances:
    │     instance_id, repo, base_commit, patch, test_patch,
    │     problem_statement, hints_text, FAIL_TO_PASS, PASS_TO_PASS
    │
    ├─ GEPA interrogation loop:
    │     For each instance, replay trajectory →
    │     "You did X, then Y happened. Why? What would you do differently?"
    │     → dense step-by-step corrections (not just pass/fail)
    │
    ├─ Store in Experience Bank (per-case + global patterns)
    │
    └─ Controller reads bank → proposes mutations to:
          ~/.crow/configs/*.yaml (D1-D5)
          ~/.crow/prompts/*.jinja2 (D1)
          MCP server configs (D2)
          → tests mutations against held-out instances
          → keeps Pareto frontier
```
