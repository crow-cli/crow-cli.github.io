# PLAN — crow-ai.dev docs & skills sprint

## **DO NOT ASK USER FOR FEEDBACK — THIS IS THE USER FEEDBACK.**
## **DO NOT ASK USER FOR NEXT STEPS — THESE ARE THE NEXT STEPS.**

Build/verify commands:
- sync + build: `cd ~/src/crow-team/crow-cli.github.io && uv --project site run sync-skills.py && uv --project site run mkdocs build`
- local serve (already running on 8123; restart after config changes): `uv --project site run mkdocs serve -a 127.0.0.1:8123`
- crow-cli tests: `cd ~/src/crow-team/crow-cli/crow-cli && uv --project . run pytest tests/unit -q`

Trajectory: 1 → 2 → 3 → 4, in order.

## Phase 1 — site shell

1.1 Landing nav: add `<a class="nav-link" href="/docs/">Docs</a>` to `.menu-links` in
    index.html (before GitHub link). Verify: grep + local static check of index.html; live
    check after deploy.
1.2 Delete stale `docs/` (myst) directory. Verify: `ls docs/` fails; workflow has no myst refs.

## Phase 2 — docs content (site-src/)

2.1 Rewrite `getting-started/installation.md`: requirements; clone monorepo to
    ~/.agents/crow/src/crow-cli (`git clone https://github.com/crow-cli/crow-cli
    ~/.agents/crow/src/crow-cli`); `uv --project <that> run crow-cli --help` as the canonical
    invocation; `crow-cli init` for config; install.sh mentioned as exists-but-not-recommended;
    zed agent_servers custom entry pointing at the clone. Verify: every command copy-pasted
    into a terminal works (test the clone path semantics + uv invocation).
2.2 New `configuration.md`: full config.yaml reference — providers/models (capabilities,
    fallbacks), mcpServers (stdio/http), services:, memory_path/memory_port, embedding,
    skills_dir, system_prompt_path, MAX_COMPACT_TOKENS/MAX_TOKENS/TEMPERATURE,
    max_retries_per_step, memory retry knobs, daemons: overrides. Verify: each key greps in
    configure.py / daemon.py / defaults.py.
2.3 New `services.md`: what a daemon is, `crow-cli daemon` commands, services: block fields,
    health semantics (health_url/tcp_port/unmanaged), `daemon install ollama-mv`, the
    playwright example. Verify: matches daemon.py + live `crow-cli daemon status`.
2.4 New `cli.md`: top-level help + one section per subcommand with real help text and a
    usage example (run one-shot/REPL/delegation recipe, inspect, models, init, install,
    daemon). Verify: text matches live `--help` outputs.
2.5 New `zed.md`: why the fork; clone/build (script/bootstrap, cargo run --bin zed or release);
    agent_servers registry entry; custom uv entry; verification via live settings.json shape.
2.6 mkdocs.yml nav: add the new pages under Getting Started / a "Guides" section (hand-edit
    the static part above the generated sentinel). Verify: mkdocs build clean (no warnings).

## Phase 3 — skills + prompt bootstrap

3.1 skill-creation SKILL.md: add "Publishing" section — edit locally, then in
    crow-cli.github.io run `uv --project site run sync-skills.py`, commit, push/PR to
    crow-cli/crow-cli.github.io; site publishes raw at /skills/ and rendered at /docs/skills/.
    Verify: re-sync picks it up; page renders.
3.2 crow-cli repo: add jinja2 else-branch to the system prompt template in
    agent/default/defaults.py — when `skills` is empty: instruct agent to web_fetch
    https://crow-ai.dev/llms.txt, pick skills matching the task, fetch the raw SKILL.md (+
    listed files) from crow-ai.dev/skills/<name>/..., and install under ~/.agents/skills
    (add-only). Mirror the same change into ~/.agents/crow/prompts/system_prompt.jinja2.
    Verify: render template both ways (skills empty / present) — block only when empty;
    pytest tests/unit green.
3.3 sync-skills.py: generate the llms.txt Docs section by walking site-src (index,
    getting-started/*, guides/*) instead of hardcoded list. Verify: llms.txt lists all pages.

## Phase 4 — verify, commit, ship

4.1 Full local pass: sync, build (zero warnings), serve, browse: /, /skills/, one skill page,
    each new docs page, raw /skills/use-uv/pyproject.toml via site-build? (raw serving is
    deploy-time; locally verify file presence in site-src), llms.txt content.
4.2 Commit crow-cli repo (prompt change) with Session-Id trailer; run unit tests first.
4.3 Commit crow-cli.github.io (everything) with Session-Id trailer.
4.4 Push both; watch deploy workflow (gh run watch or API); then curl live URLs:
    https://crow-ai.dev/ (nav link), /docs/, /docs/skills/, /skills/use-uv/SKILL.md,
    /skills/use-uv/pyproject.toml, /llms.txt — all 200.
4.5 Mark TODO.md items done with evidence; end-of-sprint summary.

## STATUS 2026-08-11 — all phases complete

- 1.1 nav link added; 1.2 stale docs/ + root myst remnants removed.
- 2.1–2.6 fresh pages written (installation/configuration/services/cli/zed + new index);
  mkdocs build zero warnings; browsed locally at 8123.
- 3.1 skill-creation Publishing section; 3.2 prompt bootstrap in defaults.py + live
  ~/.agents/crow/prompts/system_prompt.jinja2, 2 new unit tests (138 total pass);
  3.3 llms.txt Docs section generated from site-src tree.
- 4.x commits + push + live verification follow below.

## Phase 5 — landing rhetoric fix (2026-08-11, post-ship user feedback)

5.1 index.html `#cli`: remove "Agent skills" neg-table row; add positive Skills paragraph
    (catalog /docs/skills/, /llms.txt, open-a-PR pointer → crow-cli/crow-cli.github.io).
5.2 index.html `#what`: rename to "Client" (h2 + nav label); rewrite intro — ACP = LSP for
    agents, any ACP client works (link get-started/clients registry), preferred = our Zed
    fork odellus/zed + /docs/zed/, explicit no-affiliation disclaimer; drop Sidex/VS-Code
    rows, keep Transparent/Cancellable/Orchestration.
5.3 Verify: rg checks (no skills-under-didn't-build, no unintended zed/sidex/vscode refs);
    curl -o /dev/null -w "%{http_code}" every new href (clients page, odellus/zed, /docs/zed/,
    /docs/skills/, /llms.txt, crow-cli.github.io repo).
5.4 Commit (Session-Id trailer) + push; poll deploy workflow; curl live landing and grep for
    the new copy ("no affiliation", "Open a PR").
