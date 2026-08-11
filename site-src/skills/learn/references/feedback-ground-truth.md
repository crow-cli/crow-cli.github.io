---
title: "crow: User feedback as ground-truth signal for agent improvement"
date: 2026-07-18
tags: [crow, agent-training, evaluation, user-feedback, hindsight-critique]
status: idea
---

# crow: User feedback as ground-truth signal for agent improvement

## Core insight

The user's next message is the label. Instead of trying to determine objectively whether a task succeeded, use the user's reaction to each assistant turn as the ground-truth signal for performance, assessment, and evaluation.

This works for every task type (coding, writing, research) and does not require replaying traces, running tests, or knowing the "correct" answer in advance.

## User-message label taxonomy

Segment the trace at every assistant turn, then read the user's next message:

| Label | Examples / indicators |
|-------|-----------------------|
| **Positive** | "thanks", "that worked", "perfect", "yes", user moves on to a new task without correction |
| **Negative** | "no", "wrong", "idiot", "moron", "imbecile", "stop", "that's not what I asked", irritated repetition |
| **Corrective** | "actually...", "instead...", "no wait", "you should have...", "fix it by doing X" |
| **Abandonment** | No further user message after the assistant turn; session ends there |
| **Continuation** | User asks a follow-up that builds on the previous answer; implicit neutral/positive |

## Why this enables hindsight critique

With turn-level labels, hindsight becomes focused:

- **Bad turn:** user said "no you idiot."
- **Hindsight query:** "The user said X. The agent did Y. Given what the user actually wanted, what should the agent have done instead?"

The critic does not need to solve the whole task — it only needs to explain the right move given the context and the user's reaction.

## What to build from it

### 1. User-feedback classifier

Classify each user message as: `positive`, `negative`, `corrective`, `abandonment`, or `continuation`.

Approaches:
- Keyword / regex heuristics (cheap, good enough to start)
- LLM-as-judge for ambiguous cases

Map every assistant turn to the next user-message label.

### 2. Failure-mode detector

For negative/corrective turns, run a critic:

> "At step 7, the agent called `read` on the whole file when the user wanted a precision edit. The user then corrected it. The tool description for `edit` mentioned string replacement but the agent preferred `read` because the prompt emphasized understanding before editing."

This produces concrete prompt and tool-description failures.

### 3. Prompt and tool optimization

- Cluster assistant turns that precede negative feedback by failure pattern.
- A/B test new prompts and tool descriptions against the historical trace set.
- Score variants by the rate of negative/corrective user responses they produce.

This is a DSPy-like loop without needing full DSPy: the prompts and tool descriptions are the parameters; the label distribution is the objective.

### 4. Training data

- **Positive turns** → supervised fine-tuning examples.
- **Negative turn + rewritten good turn** → DPO preference pairs.
- **Corrective user messages** → tool-use and instruction-following training data.

## Simplest first implementation

A batch script running on `coast-after-3` (or wherever the crow DB lives):

1. Load every trace from `~/.crow/crow.db`.
2. For each assistant turn, read the next user message.
3. Classify it with keyword/regex heuristics.
4. For negative/corrective cases, extract the assistant turn and its context.
5. Run a critic prompt: "Why did the user react this way? What should the agent have done differently?"
6. Output common failure patterns and candidate prompt/tool fixes.

## Why this is a good fit for crow

- `session.py` already stores full message data per agent.
- `compact.py` preserves full history across compaction.
- The DB schema records tool calls, tool responses, system prompt, and tool definitions.
- No need to change the inference path; this is an offline batch analysis job.

## Open questions

- Should the classifier be keyword-based or an LLM judge?
- How far back should the hindsight critic look? One turn? Full session?
- Should we distinguish "user is frustrated with the model" from "user is frustrated with the situation"?
- How do we handle sessions where the user is deliberately exploring / vibe-coding and corrections are part of the process?

## Related notes

- `~/.agents/notes/dev/notes-ideas.md`
- `~/.agents/notes/dev/notes-editor-recon-playbook.md`
- `~/src/crow-team/crow-cli/crow-cli/src/crow_cli/agent/session.py`
- `~/src/crow-team/crow-cli/crow-cli/src/crow_cli/agent/compact.py`
