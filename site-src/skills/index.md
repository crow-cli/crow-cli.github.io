# Skills

Workflow skills for crow-cli agents. Each skill is a directory with a
`SKILL.md` that says when and how to use it. Agents load them on demand;
you can read them here or fetch them raw:

| skill | raw | files |
| --- | --- | --- |
| [acp-v2](acp-v2/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/acp-v2/SKILL.md) | — |
| [learn](learn/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/learn/SKILL.md) | [assets/bench/configs/baseline.yaml](https://crow-ai.dev/skills/learn/assets/bench/configs/baseline.yaml), [references/feedback-ground-truth.md](https://crow-ai.dev/skills/learn/references/feedback-ground-truth.md), [references/gepa-research.md](https://crow-ai.dev/skills/learn/references/gepa-research.md), [references/instance-schema.md](https://crow-ai.dev/skills/learn/references/instance-schema.md), [references/integration-brainstorm.md](https://crow-ai.dev/skills/learn/references/integration-brainstorm.md), [references/memoharness-analysis.md](https://crow-ai.dev/skills/learn/references/memoharness-analysis.md) |
| [model-probe](model-probe/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/model-probe/SKILL.md) | [assets/probe-image.png](https://crow-ai.dev/skills/model-probe/assets/probe-image.png), [pyproject.toml](https://crow-ai.dev/skills/model-probe/pyproject.toml), [scripts/probe_models.py](https://crow-ai.dev/skills/model-probe/scripts/probe_models.py) |
| [openai-streaming-tools](openai-streaming-tools/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/openai-streaming-tools/SKILL.md) | — |
| [plan-todo](plan-todo/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/plan-todo/SKILL.md) | — |
| [searxng](searxng/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/searxng/SKILL.md) | — |
| [sg](sg/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/sg/SKILL.md) | — |
| [skill-creation](skill-creation/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/skill-creation/SKILL.md) | — |
| [upstream-merge](upstream-merge/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/upstream-merge/SKILL.md) | [references/protected-files.md](https://crow-ai.dev/skills/upstream-merge/references/protected-files.md) |
| [use-uv](use-uv/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/use-uv/SKILL.md) | [pyproject.toml](https://crow-ai.dev/skills/use-uv/pyproject.toml) |
| [video-frames](video-frames/SKILL.md) | [SKILL.md](https://crow-ai.dev/skills/video-frames/SKILL.md) | — |

## acp-v2

Build against Agent Client Protocol v2 (the in-draft successor to the v1 JSON-RPC stdio protocol crow-cli currently speaks). Use when the task is "build an ACP v2 agent/client", "Rust ACP agent", "crow-cli v2", "persistent agent", "session/update stream", "state_update / move beyond the turn", orchestration / subagent verifier over ACP, or migrating the existing v1 crow-cli ACP code to v2. Covers what v2 changes vs v1, the exact repo/crate map (the non-obvious bit), the verified Rust wire types, the new prompt lifecycle that enables event-driven orchestration, and how to scaffold crow-cli v2 as a PERSISTENT Rust ACP AGENT (with MCP tools + native lancedb), plus the client/conductor side for orchestration. Source = the cloned spec repo ~/src/crow-team/agent-client-protocol and the cloned runtime ~/src/crow-team/rust-sdk (schema v2.0.0-alpha.2, draft 2026-07-20).

## learn

Optimize agent harness configs via bench testing. Use when the user asks to "improve the prompt", "run a bench", "optimize the harness", "A/B test configs", or "learn from failures." Builds test instances from crow.db, runs variants, judges outputs, and hill-climbs toward better configs.

## model-probe

Probe provider models with a real image to find out which are truly vision-capable, print the raw evidence, and (after YOU judge the results) write per-model modality lists into ~/.agents/crow/config.yaml. Use when the user says 'probe the models', 'which models have vision', 'fill out model capabilities', 'mark the text-only models', 'update modalities', 'vision capable', or after adding new models to config.yaml. Crow assumes [text, image] by default ('let it fail'); this skill produces the evidence and you fill in the optional values.

## openai-streaming-tools

OpenAI Chat Completions streaming tool call accumulation — the wire format, the index-keyed accumulation algorithm, the tool_call_id contract that links assistant messages to tool results, provider quirks, and the async-openai Rust types. Use when building or debugging a react loop, streaming tool calls, assembling conversation history with tool results, or touching anything in react.rs / process_response / execute_tool_calls. Also covers how ACP v2 ToolCallUpdate IDs relate (separate namespace, do NOT conflate). Trigger keywords — streaming tool calls, tool_call accumulation, tool_call_id, delta index, react loop, function calling stream, parallel tool calls.

## plan-todo

The plan-todo development loop — how to run a long multi-task sprint without stopping to ask. Use when the user drops a big pivot or brain-dump of work ("write this down", "here's everything"), when starting a sprint, when a session says "TODO.md / PLAN.md", or when you are a compacted/next agent picking up unfinished work. Write unordered TODO, write ordered PLAN with explicit test criteria, then work item by item — finish, verify, mark done, update both files, move on — until everything is complete. No feedback-seeking mid-sprint.

## searxng

Recover the local searxng instance that backs the web_search tool. Use when web_search returns empty results, errors out, or you suspect the search backend is down ("search engine down", "web search not working", "searxng", "no results found" on a query that should have hits). Web search is NOT optional equipment — if it is broken, fix it before continuing, don't silently fall back to guessing. Diagnose, restart the container, retry.

## sg

Use ast-grep (sg) for AST-based structural code search, lint, and rewrite. Reach for it instead of grep/sed whenever a change is about CODE STRUCTURE rather than text — renaming an identifier/param/kwarg/attribute across a repo, changing a function signature and all its call sites, swapping one API for another, or linting for a code shape. It matches whole syntax-tree nodes so it never substring-matches (renaming `db_uri` will NOT touch `my_db_uri`), and it ignores strings/comments unless you target them. Covers `sg run` (one-shot search/rewrite), `sg scan` (YAML rules), `sg test`, metavar syntax, relational rules, and a detailed, empirically-verified list of what does and does NOT work (kwarg-pattern pitfalls, metavar gotchas, project setup).

## skill-creation

Create new agent skills. Use when you notice a recurring task pattern that should be codified, or when the user asks to "make a skill" or "save this workflow." Skills are directories in ~/.agents/skills/ with a SKILL.md file.

## upstream-merge

Tactically merge upstream zed-industries/zed changes into the crow fork without losing crow's character. Use when the user says "merge upstream", "pull from zed", "sync with upstream", "rebase crow", "bring in upstream changes", or "what did upstream do". Fetches upstream, triages incoming commits by which protected crow area they touch, merges per-category, and runs the gate (build + rebrand-integrity scan + crow characterization tests) so no merge can silently revert crow -> zed. Strategy doc: ~/.agents/notes/dev/crow-upstream-merge-strategy.md

## use-uv

A ready-to-run Python sandbox that lives inside this skill. Use it whenever you need to EXECUTE Python — the terminal harness REJECTS raw python3/python ("Use 'uv' instead of python"), but `uv --project ~/.agents/skills/use-uv run python ...` is always allowed. Comes with pyyaml, httpx, and rich pre-installed; add more with `uv --project ~/.agents/skills/use-uv add <pkg>`. Reach for this to parse YAML/JSON, hit an HTTP API, pretty-print with rich, or run any throwaway script without setting up a venv. Trigger keywords — run python, execute script, uv, virtual environment, venv, pyyaml, httpx, parse yaml, harness rejected python.

## video-frames

Turn video (Playwright browser recordings, screen/webcam captures, any video file) into frames, and crop regions of interest out of frames for vision analysis. Use when the user asks to 'record the browser', 'take a video of the page', 'split the video into frames', 'extract frames', 'crop the screenshot', 'zoom into that area', 'check what the UI did', debug a UI flow over time, or analyze anything that moves. Frames are the universal path — Claude (sonnet/opus 5) and GPT-5.x have NO native video input (Anthropic's own recipe is break video into frames and do vision on them), and crow's image pipeline (read_image_file) already ships them to any vision model.
