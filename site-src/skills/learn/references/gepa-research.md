---
title: "GEPA: Reflective Prompt Evolution — Research & Architectural Fit"
date: 2026-07-21
tags: [gepa, dspy, prompt-optimization, evolutionary, research]
status: reference
---

# GEPA: Reflective Prompt Evolution

## The Paper

**GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning**
Agrawal, Tan, Soylu, Ziems, Khare, Opsahl-Ong, Singhvi, Shandilya, Ryan, Jiang,
Potts, Sen, Dimakis, Stoica, Klein, Zaharia, Khattab.
arXiv:2507.19457 — ICLR 2026 (Oral).

- Paper: <https://arxiv.org/abs/2507.19457>
- Code: <https://github.com/gepa-ai/gepa>
- DSPy integration: <https://dspy.ai/api/optimizers/GEPA/overview/>
- DSPy tutorials: <https://dspy.ai/tutorials/gepa_ai_program/>
- HuggingFace cookbook: <https://huggingface.co/learn/cookbook/dspy_gepa>
- Standalone site: <https://gepa-ai.github.io/gepa/>

## Core Result

GEPA outperforms GRPO (RL) by **6% avg, up to 20%**, using **35x fewer rollouts**.
Outperforms MIPROv2 (previous best prompt optimizer) by **10%+** (+12% on AIME-2025).

Production data point (from DSPy docs): Shopify converted a single-prompt GPT-5
task to DSPy + small Qwen model + GEPA optimization → **~75x cheaper, ~2x more
reliable**.

## How GEPA Works

1. **Sample trajectories** from the system (reasoning, tool calls, tool outputs)
2. **Reflect in natural language** on what went well, what didn't, why
3. **Propose prompt mutations** based on reflection
4. **Evaluate** candidates on a validation set
5. **Select from Pareto frontier** — stochastically pick from non-dominated candidates
6. **Merge** complementary lessons from different frontier members
7. Repeat

Key mechanism: the metric can return **textual feedback** alongside the scalar
score (`ScoreWithFeedback = {'score': float, 'feedback': str}`). This feedback
is per-predictor or per-program. GEPA uses it to guide reflection — "this
trajectory got 0.3 because the agent used `read` instead of `edit`" is worth
more than just "0.3".

## DSPy Integration

`dspy.GEPA` is a `Teleprompter` (optimizer) that evolves text components of DSPy
programs. It captures full execution traces, identifies spans per predictor,
reflects on behavior, and proposes new instructions.

```python
gepa = dspy.GEPA(
    metric=metric,                    # returns score + optional text feedback
    reflection_lm=dspy.LM('gpt-5'),  # strong model for reflection
    auto='medium',                    # budget: light/medium/heavy
    candidate_selection_strategy='pareto',
    use_merge=True,                   # merge complementary frontier members
)
optimized = gepa.compile(student, trainset=trainset)
```

Also integrated into: MLflow (`mlflow.genai.optimize_prompts()`), Comet ML Opik,
Pydantic AI, OpenAI Cookbook.

## Why We DON'T Use DSPy Adapters

**The impedance mismatch is fundamental, not incidental.**

A DSPy program is a **closed typed circuit**:

```python
class QA(dspy.Module):
    def __init__(self):
        self.generate = dspy.ChainOfThought("question -> answer")
    def forward(self, question):
        return self.generate(question=question)
```

- Inputs are **known, structured, enumerable**: `Example(question=..., answer=...)`
- The program topology is **static** — only the text inside nodes changes
- Traces are **internal to the circuit** — GEPA knows which predictor produced
  which span, can attribute failure to a specific module
- The dataset is a **fixed set of typed pairs** you can iterate over

A coding agent is **open-loop partial observation**:

- The "input" is a 200k-file repo the agent has never seen
- The agent **discovers** the relevant files through tool calls that are
  themselves part of the computation
- The trace isn't internal state of a fixed circuit — **it IS the computation**
- You can't re-run "the same input" because the agent's first `grep` changes
  what it sees next
- The state space is filesystem × git history × terminal output × everything
  the agent chose to look at
- There is no `Example` to enumerate

**SWE-bench makes this concrete**: the "dataset" is `(repo@commit, issue_text) → patch`.
But the actual task is a 40-step exploration process. Two agents with identical
configs take completely different paths through the repo. The fitness signal
isn't "did the Prediction match the gold answer" — it's "did the tests pass
after a stochastic multi-turn interaction with an environment." DSPy's
`metric(gold, pred, trace)` signature doesn't capture that. Flattening the
entire interactive process into a single scalar destroys exactly the signal
GEPA's per-predictor attribution needs.

**The search space is also different.** GEPA optimizes prompts within a fixed
program. We optimize the **entire agent harness**: system prompt, tool
descriptions, MCP server configs, orchestration params, compaction thresholds,
output format (D1-D6). That's a strictly larger space than "instruction text
inside a DSPy predictor."

## What We Take From GEPA (the ideas, not the library)

1. **Reflect on traces in natural language, not just scalar rewards.**
   The user's correction ("no you idiot, use edit") is denser signal than
   score=0.2. Our feedback-ground-truth taxonomy (positive/negative/corrective/
   abandonment/continuation) is exactly GEPA's `ScoreWithFeedback`.

2. **Pareto frontier selection, not greedy best.**
   Keep the non-dominated set across all bench instances. A config that's
   great at code editing but bad at note-taking stays on the frontier.

3. **Merge complementary lessons.**
   If variant A fixed D1 (context) failures and variant B fixed D4
   (orchestration) failures, merge them. Don't just pick one winner.

4. **Reflection minibatches.**
   Don't reflect on one trace at a time. Look at 3-5 failures together to
   find patterns. GEPA's `reflection_minibatch_size=3` default.

5. **Sample efficiency from reflection.**
   35x fewer rollouts than RL because natural language reflection extracts
   more information per trial than a gradient step. Each failed session is
   worth more when you interrogate it.

## Our Architecture: Agent as Optimizer

Instead of wrapping crow-cli in DSPy adapters, the agent IS the optimizer:

```
┌─────────────────────────────────────────────────┐
│  Optimization Loop (a crow-cli session)         │
│                                                 │
│  1. Read N session traces from crow.db          │
│  2. Classify failures by dimension (D1-D6)      │
│  3. Reflect: "why did these fail? what pattern?"│
│  4. Propose config mutations (YAML + Jinja2)    │
│  5. Spawn parallel bench runs:                  │
│     crow-cli run --config-file bench/v001.yaml  │
│     crow-cli run --config-file bench/v002.yaml  │
│     crow-cli run --config-file bench/v003.yaml  │
│  6. Score results (LLM-as-judge + user feedback │
│     retrodiction)                               │
│  7. Select Pareto frontier                      │
│  8. Merge complementary winners                 │
│  9. Archive iteration, repeat                   │
└─────────────────────────────────────────────────┘
```

No `ProposalFn` protocol. No `ScoreWithFeedback` type. No trace decomposition
into predictor spans. The reflection step is just another agent call. The
Pareto selection is an agent looking at a table of scores. The merge is an
agent reading two config diffs and combining them.

**Why this works**: the GEPA paper's contribution isn't the DSPy integration.
It's the insight that natural language reflection on execution traces is a
richer learning signal than scalar rewards, and that evolutionary selection
over text components (prompts, configs) with reflective mutation beats RL.
We implement that insight natively, in the same medium the agent already
operates in — natural language, tool calls, file edits — without inheriting
DSPy's assumption that the world is a typed dataset.

## Related Work & Ecosystem

| Project | What | Link |
|---------|------|------|
| GEPA | Reflective prompt evolution (the paper) | <https://github.com/gepa-ai/gepa> |
| DSPy | Typed LM program framework, GEPA's home | <https://github.com/stanfordnlp/dspy> |
| MemoHarness | Harness-level optimization, D1-D6 | arXiv:2607.14159, `~/src/crow-team/MemoHarness/` |
| MIPROv2 | Previous best DSPy optimizer (GEPA beats it) | DSPy built-in |
| GRPO | RL baseline (GEPA beats it 35x on samples) | Group Relative Policy Optimization |
| Arbor | Agent architecture discovery, GEPA-integrated | <https://github.com/noahziems/arbor> |
| SWE-bench | Software engineering benchmark (our instance format) | <https://github.com/princeton-nlp/SWE-bench> |
